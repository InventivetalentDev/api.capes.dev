import { Application, Request, Response } from "express";
import { CapeHandler } from "../CapeHandler";
import { Requests } from "../Requests";

export const register = (app: Application) => {

    app.get("/img/:hash", async function (req: Request, res: Response) {
        let hash = req.params.hash;
        hash = hash.split(".")[0]; // Remove potential file extensions

        await findAndSendCapeImage(req, res, hash, undefined, typeof req.query["still"] !== "undefined", typeof req.query["animated"] !== "undefined");
    });

    app.get("/img/:transform/:hash", async function (req: Request, res: Response) {
        let transform = req.params.transform;
        let hash = req.params.hash;
        hash = hash.split(".")[0]; // Remove potential file extensions

        await findAndSendCapeImage(req, res, hash, transform, typeof req.query["still"] !== "undefined", typeof req.query["animated"] !== "undefined");
    });

    async function findAndSendCapeImage(req: Request, res: Response, imageHash: string, transform?: string, preferStill: boolean = false, preferAnimated: boolean = false): Promise<void> {
        const imageUrl = await CapeHandler.findCapeImageUrl(imageHash, transform, preferStill, preferAnimated);
        if (!imageUrl) {
            res.status(404).json({error: "not found"});
        } else {
            res.header("X-Image-Location", imageUrl);
            Requests.axiosInstance.request({
                method: "GET",
                url: imageUrl,
                responseType: "stream"
            }).then(response => {
                response.data.pipe(res);
            }).catch(err => {
                if (err.response.status === 404) {
                    res.status(404).json({error: "cape image not found"});
                } else {
                    console.warn(err);
                    res.status(500).json({error: "failed to load cape image"});
                    if (err.response) {
                        console.warn(err.response.data);
                        console.warn(err.response.errors);
                    }
                }
            })
        }
    }


}
