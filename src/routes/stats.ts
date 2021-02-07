import { Application, query, Request, Response } from "express";
import { Cape } from "../database/schemas/cape";
import { HAS_NO_CAPE } from "../util";
import { Stats } from "../typings/Stats";

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
        const perTypeCount = Cape.aggregate([{ $match: { imageHash: { $ne: HAS_NO_CAPE } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]).exec()
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
    }

    setInterval(() => queryStats(), 60000);
    queryStats();

}
