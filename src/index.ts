import "./instrument"

import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import * as sourceMapSupport from "source-map-support";
import { getConfig } from "./typings/Configs";
import gitsha from "@inventivetalent/gitsha";
import * as express from "express";
import "express-async-errors";
import { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import { apiRequestsMiddleware } from "./util/metrics";
import { corsMiddleware, getIp, HAS_NO_CAPE } from "./util";
import { info, warn } from "./util/colors";
import { CapeError } from "./typings/CapeError";
import { v2 as cloudinary } from "cloudinary";
import { statsRoute, getRoute, imgRoute, typesRoute, loadRoute, historyRoute } from "./routes";
import connectToMongo from "./database";
import * as bodyParser from "body-parser";
import { Puller } from "express-git-puller";
import { Cape } from "./database/schemas/cape";
import * as FormData from "form-data";
import { Requests } from "./Requests";
import { CapeHandler } from "./CapeHandler";

sourceMapSupport.install();

const config = getConfig();

let updatingApp = true;

console.log("\n" +
    "  ==== STARTING UP ==== " +
    "\n");

const app: Express = express();

async function init() {
    console.log("Node Version " + process.version);

    {
        console.log("Initializing Cloudinary");
        cloudinary.config(config.cloudinary);
    }

    {
        console.log("Setting up express middleware")

        app.set("trust proxy", 1);
        app.use(corsMiddleware);
        app.use((req, res, next) => {
            Sentry.setUser({
                ip_address: getIp(req)
            });
            next();
        });
        app.use(apiRequestsMiddleware);

        app.use("/.well-known", express.static(".well-known"));
    }

    {// Git Puller
        console.log("Setting up git puller");

        const puller = new Puller({
            ...{
                events: ["push"],
                branches: ["master"],
                vars: {
                    appName: "capes"
                },
                commandOrder: ["pre", "git", "install", "post"],
                commands: {
                    git: [
                        "git fetch --all",
                        "git reset --hard origin/master"
                    ],
                    install: [
                        "npm install",
                        "npm run build"
                    ],
                    post: [
                        "pm2 restart $appName$"
                    ]
                },
                delays: {
                    install: Math.ceil(Math.random() * 200),
                    post: 500 + Math.ceil(Math.random() * 1000)
                }
            },
            ...config.puller
        });
        puller.on("before", (req: Request, res: Response) => {
            updatingApp = true;
            console.log(process.cwd());
        });
        app.use(function (req: Request, res: Response, next: NextFunction) {
            if (updatingApp) {
                res.status(503).send({err: "app is updating"});
                return;
            }
            next();
        });
        //FIXME
        // app.use(config.puller.endpoint, bodyParser.json({ limit: '100kb' }), puller.middleware);
    }

    {
        console.log("Connecting to database")
        await connectToMongo(config);
    }

    {
        console.log("Registering routes");

        app.get("/", function (req, res) {
            res.json({msg: "Hi!"});
        });

        app.get("/openapi.yml", (req, res) => {
            res.sendFile("/openapi.yml", {root: `${ __dirname }/..`});
        });
        app.get("/openapi", (req, res) => {
            res.redirect("https://openapi.inventivetalent.dev/?https://api.capes.dev/openapi.yml");
        });

        statsRoute.register(app);
        typesRoute.register(app);
        getRoute.register(app);
        imgRoute.register(app);
        historyRoute.register(app);
        loadRoute.register(app);

    }


    const preErrorHandler: ErrorRequestHandler = (err, req: Request, res: Response, next: NextFunction) => {
        console.warn(warn("Error in a route " + err.message));
        if (err instanceof CapeError) {
            Sentry.setTags({
                "error_type": err.name,
                "error_code": err.code
            });
            if (err.httpCode) {
                Sentry.setTag("error_httpcode", `${ err.httpCode }`);
                res.status(err.httpCode);
            } else {
                res.status(500);
            }
        } else {
            Sentry.setTag("unhandled_error", err.name)
        }
        next(err);
    };
    app.use(preErrorHandler);
    Sentry.setupExpressErrorHandler(app);
    const errorHandler: ErrorRequestHandler = (err, req: Request, res: Response, next: NextFunction) => {
        if (err instanceof CapeError) {
            res.json({
                success: false,
                errorType: err.name,
                errorCode: err.code,
                error: err.msg
            });
        } else {
            res.status(500).json({
                success: false,
                error: "An unexpected error occurred"
            })
        }
    }
    app.use(errorHandler);


    console.log("starting cloudflare migration task");
    setInterval(async () => {
        await migrateCapeToCloudflare();
    }, 1000 * 5);
    await migrateCapeToCloudflare();
}

async function migrateCapeToCloudflare() {
    try {
        const cape = await Cape.findOne({
            $or: [
                {cdn: {$exists: false}},
                {cdn: {$ne: "cloudflare"}}
            ],
            imageHash: {$ne: HAS_NO_CAPE}
        });
        if (!cape) {
            console.log("No capes to migrate");
            return;
        }
        console.log("Migrating cape " + cape.id);

        const formData = new FormData();
        formData.append("url", await CapeHandler.findCapeImageUrl(cape.imageHash));

        let publicId = cape.imageHash;
        const metadata: any = {
            "cape": cape.type,
            "type": cape.type,
            "migrated": "cloudinary"
        };
        const suffix = cape.animated ? 'animated' : null;
        if (suffix) {
            publicId += "_" + suffix;
            metadata["suffix"] = suffix;
        }
        // if (meta) {
        //     for (const key of Object.keys(meta)) {
        //         metadata[key] = meta[key];
        //     }
        // }

        formData.append("id", `capes/${ publicId }`);
        formData.append("metadata", JSON.stringify(metadata));

        try {
            let res;
            try {
                res = await Requests.axiosInstance.request({
                    method: "POST",
                    url: `https://api.cloudflare.com/client/v4/accounts/${ config.cloudflare.accountId }/images/v1`,
                    headers: {
                        "Authorization": "Bearer " + config.cloudflare.apiToken,
                        "Content-Type": `multipart/form-data; boundary=${ formData.getBoundary() }`,
                    },
                    data: formData
                });
                console.log(res.data);
            } catch (e) {
                if (e.response) {
                    console.log(e.response.data)
                    console.log(e.response.errors);
                    res = e.response;
                }
            }

            let success = false;
            let skip = false;
            if (res && res.data.success) {
                success = true;
            } else {
                for (const error of res.data.errors) {
                    console.log(error.message);
                    if (error.message.includes('Fetching image from imagedelivery.net')) {
                        // already on cloudflare
                        success = true;
                    }
                    if (error.message.includes('Resource already exists')) {
                        // already on cloudflare
                        success = true;
                    }
                    if (error.message.includes('Error during the fetch, code: 404')) {
                        // image not found
                        skip = true;
                    }
                }
            }

            if (success || skip) {
                console.log("Migrated cape " + cape.id);
                cape.cdn = "cloudflare";
                if (skip) {
                    await cape.delete();
                } else {
                    await cape.save();
                }

                await cloudinary.uploader.destroy(`capes/${ cape.imageHash }`, (error, result) => {
                    if (error) {
                        console.error("Failed to delete old cape " + cape.imageHash);
                        console.error(error);
                    } else {
                        console.log("Deleted old cape " + cape.imageHash);
                        console.log(result);
                    }
                });
            } else {
                console.error("Failed to migrate cape " + cape.id);
            }
        } catch (e) {
            if (e.response) {
                console.log(e.response.data)
                console.log(e.response.errors);
            }
        }

    } catch (e) {
        console.error(e)
    }
}

init().then(() => {
    setTimeout(() => {
        console.log("Starting app");
        app.listen(config.port, function () {
            console.log(info(" ==> listening on *:" + config.port + "\n"));
            setTimeout(() => {
                updatingApp = false;
                console.log(info("Accepting connections."));
            }, 200);
        });
    }, 200);
});

