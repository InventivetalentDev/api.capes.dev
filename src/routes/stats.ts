import * as Sentry from "@sentry/node";
import { Application, query, Request, Response } from "express";
import { Cape } from "../database/schemas/cape";
import { HAS_NO_CAPE } from "../util";
import { Stats } from "../typings/Stats";
import { metrics } from "../util/metrics";
import { IPoint } from "influx";
import { CapeType } from "../typings/CapeType";

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
        const distinctPlayerCount = await Cape.aggregate([{ $group: { _id: "$player" } }, { $count: "count" }]).exec().then((docs: any[]) => docs[0]["count"]);
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

        console.log("stats query took " + ((Date.now() - start) / 1000) + "s");
    }

    setInterval(() => queryStats(), 60000);
    queryStats();

}
