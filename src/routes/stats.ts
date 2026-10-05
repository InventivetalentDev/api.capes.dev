import * as Sentry from "@sentry/node";
import { Application, query, Request, Response } from "express";
import { Cape } from "../database/schemas/cape";
import { StatsSnapshot } from "../database/schemas/statsSnapshot";
import { HAS_NO_CAPE } from "../util";
import { Stats } from "../typings/Stats";
import { metrics, metricsEnabled } from "../util/metrics";
import { IPoint } from "influx";
import { CapeType } from "../typings/CapeType";
import { LeaderTask } from "../LeaderTask";

const STATS_INTERVAL = 60000;
const SNAPSHOT_ID = "global";

export const register = (app: Application) => {

    const stats: Stats = {
        total: 0,
        players: 0,
        types: {}
    };

    app.get("/stats", async function (req: Request, res: Response) {
        res.json(stats);
    });


    async function queryStats(): Promise<void> {
        const start = Date.now();

        // Counts are taken as count(type) - count(type, no cape), which only reads the {type, imageHash} index.
        // Matching on imageHash $ne can't be answered from an index, so it had to fetch every cape document.
        const capeTypes: CapeType[] = await Cape.distinct("type").exec();
        const [typeCounts, distinctPlayerCount] = await Promise.all([
            Promise.all(capeTypes.map(async type => {
                const [all, noCape] = await Promise.all([
                    Cape.countDocuments({ type: type }).exec(),
                    Cape.countDocuments({ type: type, imageHash: HAS_NO_CAPE }).exec()
                ]);
                return all - noCape;
            })),
            // DISTINCT_SCAN over the {player, type, time} index, no documents are read
            Cape.aggregate([{ $group: { _id: "$player" } }, { $count: "count" }]).exec()
                .then((docs: any[]) => docs.length > 0 ? docs[0]["count"] as number : 0)
        ]);
        const perTypeCount: { [s: string]: number } = {};
        capeTypes.forEach((type, i) => perTypeCount[type] = typeCounts[i]);
        const totalCount = typeCounts.reduce((sum, count) => sum + count, 0);

        stats.total = totalCount;
        stats.players = distinctPlayerCount;
        stats.types = perTypeCount;

        // share the result with the other instances, which don't run the query themselves
        await StatsSnapshot.updateOne({ _id: SNAPSHOT_ID }, {
            $set: {
                total: totalCount,
                players: distinctPlayerCount,
                types: perTypeCount,
                updatedAt: new Date()
            }
        }, { upsert: true }).exec();

        try {
            let points: IPoint[] = [];
            for (let type in perTypeCount) {
                points.push({
                    measurement: 'cape_types',
                    tags: {
                        type: type
                    },
                    fields: {
                        count: perTypeCount[type]
                    }
                });
            }
            points.push({
                measurement: 'capes',
                fields: {
                    total: totalCount,
                    players: distinctPlayerCount
                }
            });
            if (metricsEnabled) {
                await metrics.influx.writePoints(points);
            }
        } catch (e) {
            Sentry.captureException(e);
        }

        console.log("stats query took " + ((Date.now() - start) / 1000) + "s");
    }

    async function loadStats(): Promise<void> {
        const snapshot = await StatsSnapshot.findById(SNAPSHOT_ID).lean().exec();
        if (snapshot) {
            stats.total = snapshot.total;
            stats.players = snapshot.players;
            stats.types = snapshot.types;
        }
    }

    // the queries scan the whole collection, so only one instance runs them
    const statsTask = new LeaderTask("stats", STATS_INTERVAL, queryStats).start();

    const refreshStats = () => {
        if (!statsTask.isLeader) {
            loadStats().catch(e => Sentry.captureException(e));
        }
    };
    setInterval(refreshStats, STATS_INTERVAL);
    refreshStats();

}
