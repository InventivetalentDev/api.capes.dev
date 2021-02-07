import { Application, Request, Response } from "express";
import { CapeHandler } from "../CapeHandler";
import { Caching } from "../Caching";

export const register = (app: Application) => {

    app.get("/get/:hash", async function (req: Request, res: Response) {
        const hash = req.params["hash"];

        const cape = await Caching.getCapeByHash(hash);
        if (!cape) {
            res.status(404).json({ error: "not found" });
            return;
        }

        res.json(CapeHandler.makeCapeInfo(cape, true, false));
    });

}
