import * as Sentry from "@sentry/node";
import { Application, query, Request, Response } from "express";
import { Cape } from "../database/schemas/cape";
import { HAS_NO_CAPE } from "../util";
import { Stats } from "../typings/Stats";
import { metrics } from "../util/metrics";
import { IPoint } from "influx";

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
        const totalCount = await Cape.countDocuments({ imageHash: { $ne: HAS_NO_CAPE } }).exec();
        const distinctPlayerCount = await Cape.find().distinct("player").exec().then(docs => docs.length);
        const perTypeCount = await Cape.aggregate([{ $match: { imageHash: { $ne: HAS_NO_CAPE } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]).exec()
            .then((perType: any[]) => {
                let types: { [s: string]: number } = {};
                for (let t of perType) {
                    types[t["_id"]] = Math.floor(t["count"]);
                }
                return types;
            });

        stats.total = totalCount;
        stats.players = distinctPlayerCount;
        stats.types = perTypeCount;

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
            await metrics.influx.writePoints(points);
        } catch (e) {
            Sentry.captureException(e);
        }
    }

    setInterval(() => queryStats(), 60000);
    queryStats();

}
