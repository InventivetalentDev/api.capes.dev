import { Application, Request, Response } from "express";
import { CapeType } from "../typings/CapeType";
import { SUPPORTED_TYPES } from "../CapeHandler";

export const register = (app: Application) => {

    app.get("/types", async function (req: Request, res: Response) {
        res.json(SUPPORTED_TYPES);
    });

}
