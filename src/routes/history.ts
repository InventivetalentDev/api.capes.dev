import { Application, Request, Response } from "express";
import { CapeHandler, SUPPORTED_TYPES } from "../CapeHandler";
import { Cape } from "../database/schemas/cape";
import { HAS_NO_CAPE } from "../util";
import { CapeInfo } from "../typings/CapeInfo";

export const register = (app: Application) => {

    app.get("/history/:player/:type?", async function (req: Request, res: Response) {
        let player = req.params["player"];
        const type = (req.params["type"] || "all").toLowerCase();
        if (player.length < 1 || player.length > 36) {
            res.status(400).json({ error: "invalid player" });
            return;
        }
        player = player.replace(/-/g, "").toLowerCase();

        if (type !== "all" && !(type in SUPPORTED_TYPES)) {
            res.status(400).json({ error: type + " is not supported. (" + SUPPORTED_TYPES + ")" })
            return;
        }

        let capeQuery: any = {};
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

        const capes = await Cape.find(capeQuery).sort({ time: -1 }).exec();
        const history: CapeInfo[] = [];
        capes.forEach(cape => {
            if (cape.imageHash !== HAS_NO_CAPE) {
                history.push(CapeHandler.makeCapeInfo(cape, false));
            }
        });
        res.json({
            type: type,
            player: player,
            history: history
        })
    });


}
