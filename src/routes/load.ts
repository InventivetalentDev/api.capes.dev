import { Application, Request, Response } from "express";
import { CapeHandler, SUPPORTED_TYPES } from "../CapeHandler";
import { CapeType } from "../typings/CapeType";
import { LoadedCapeInfo } from "../typings/LoadedCapeInfo";
import { Maybe } from "../util";
import { CapeInfo } from "../typings/CapeInfo";

export const register = (app: Application) => {

    app.get("/load/:player/:type?", async function (req: Request, res: Response) {
        let player = req.params["player"];
        const type = (req.params["type"] || "all").toLowerCase();
        if (player.length < 1 || player.length > 36) {
            res.status(400).json({ error: "invalid player" });
            return;
        }
        player = player.replace(/-/g, "").toLowerCase();

        if (type === "all") {
            let capes: Maybe<LoadedCapeInfo>[] = [];
            for (let type of SUPPORTED_TYPES) {
                capes.push(await CapeHandler.getOrLoadCape(type as CapeType, player));
            }

            if (!capes || capes.length <= 0) {
                res.status(404).json({ error: "not found" });
            } else {
                let obj: { [s: string]: CapeInfo } = {};
                for (let capeInfo of capes) {
                    if (!capeInfo) continue;
                    obj[capeInfo.cape.type] = CapeHandler.makeCapeInfo(capeInfo.cape, true, capeInfo.changed);
                }
                res.json(obj);
            }
        } else {
            if (!(type in SUPPORTED_TYPES)) {
                res.status(400).json({ error: type + " is not supported. (" + SUPPORTED_TYPES + ")" });
                return;
            }

            const capeInfo = await CapeHandler.getOrLoadCape(type as CapeType, player);
            if (!capeInfo) {
                res.status(404).json({ error: "not found" });
            } else {
                res.json(CapeHandler.makeCapeInfo(capeInfo.cape, true, capeInfo.changed));
            }
        }
    });


}