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

        const totalCount = await Cape.countDocuments({ imageHash: { $ne: HAS_NO_CAPE } }).exec();
        const distinctPlayerCount = await Cape.aggregate([{ $group: { _id: "$player" } }, { $count: "count" }]).exec().then((docs: any[]) => docs.length > 0 ? docs[0]["count"] : 0);
        const perTypeCount = await Cape.aggregate([{ $match: { imageHash: { $ne: HAS_NO_CAPE } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]).exec()
            .then((perType: any[]) => {
                let types: { [s: string]: number } = {};
                for (let t of perType) {
                    types[t["_id"]] = Math.floor(t["count"]);
                }
                return types;
            });

        // const perTypeCount: {[type: string]: number} = {};
        // const typePromises = [];
        // for (let type of Object.values(CapeType)) {
        //     typePromises.push(Cape.countDocuments({ imageHash: { $ne: HAS_NO_CAPE }, type: type }).exec().then(c => perTypeCount[type] = c));
        // }
        // await Promise.all(typePromises);


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
