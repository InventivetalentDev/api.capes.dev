import { Application, Request, Response } from "express";
import { CapeHandler, SUPPORTED_TYPES } from "../CapeHandler";
import { Cape } from "../database/schemas/cape";
import { HAS_NO_CAPE } from "../util";
import { CapeInfo } from "../typings/CapeInfo";
import { ICape } from "../typings/ICapeDocument";

const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;

export const register = (app: Application) => {

    app.get("/history/:player/:type?", async function (req: Request, res: Response) {
        let player = req.params["player"];
        const type = (req.params["type"] || "all").toLowerCase();
        if (player.length < 1 || player.length > 36) {
            res.status(400).json({ error: "invalid player" });
            return;
        }
        player = player.replace(/-/g, "").toLowerCase();

        if (type !== "all" && !SUPPORTED_TYPES.includes(type)) {
            res.status(400).json({ error: type + " is not supported. (" + SUPPORTED_TYPES + ")" })
            return;
        }

        let capeQuery: any = {
            imageHash: { $ne: HAS_NO_CAPE }
        };
        if (type !== "all") {
            capeQuery.type = type;
        }
        if (req.query["after"] || req.query["before"]) {
            let timeQuery: any = {};
            if (req.query.after) {
                timeQuery["$gt"] = parseInt(req.query["after"] as string);
            }
            if (req.query.before) {
                timeQuery["$lt"] = parseInt(req.query["before"] as string);
            }
            capeQuery.time = timeQuery;
        }
        if (player.length < 20) { // name
            capeQuery.lowerPlayerName = player.toLowerCase();
        } else { // uuid
            capeQuery.player = player.toLowerCase();
        }

        const limit = Math.min(Math.max(parseInt(req.query["limit"] as string) || DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);

        const capes = await Cape.find(capeQuery).sort({ time: -1 }).limit(limit).lean<ICape[]>().exec();
        const history: CapeInfo[] = capes.map(cape => CapeHandler.makeCapeInfo(cape, false));
        res.json({
            type: type,
            player: player,
            history: history
        })
    });


}
