import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import * as sourceMapSupport from "source-map-support";
import { getConfig } from "./typings/Configs";
import gitsha from "@inventivetalent/gitsha";
import * as express from "express";
import "express-async-errors";
import { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import { apiRequestsMiddleware } from "./util/metrics";
import { corsMiddleware, getIp } from "./util";
import { info, warn } from "./util/colors";
import { CapeError } from "./typings/CapeError";
import { v2 as cloudinary } from "cloudinary";
import { statsRoute, getRoute, imgRoute, typesRoute, loadRoute, historyRoute } from "./routes";
import connectToMongo from "./database";
import * as bodyParser from "body-parser";
import { Puller } from "express-git-puller";

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
        console.log("Initializing Sentry")
        Sentry.init({
            dsn: config.sentry.dsn,
            release: await gitsha(),
            integrations: [
                new Sentry.Integrations.Http({ tracing: true }),
                new Tracing.Integrations.Express({ app })
            ],
            tracesSampleRate: 0.02,
            sampleRate: 0.5
        });

        app.use(Sentry.Handlers.requestHandler());
        app.use(Sentry.Handlers.tracingHandler());
    }

    {
        console.log("Initializing Cloudinary");
        cloudinary.config(config.cloudinary);
    }

    {
        console.log("Setting up express middleware")

        app.set("trust proxy", 1);
        app.use(apiRequestsMiddleware);
        app.use(corsMiddleware);
        app.use((req, res, next) => {
            Sentry.setUser({
                ip_address: getIp(req)
            });
            next();
        })

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
                res.status(503).send({ err: "app is updating" });
                return;
            }
            next();
        });
        app.use(config.puller.endpoint, bodyParser.json({ limit: '100kb' }), puller.middleware);
    }

    {
        console.log("Connecting to database")
        await connectToMongo(config);
    }

    {
        console.log("Registering routes");

        app.get("/", function (req, res) {
            res.json({ msg: "Hi!" });
        });

        app.get("/openapi.yml", (req, res) => {
            res.sendFile("/openapi.yml", { root: `${ __dirname }/..` });
        });
        app.get("/openapi", (req, res) => {
            res.redirect("https://openapi.inventivetalent.dev/#https://api.capes.dev/openapi.yml");
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
    app.use(Sentry.Handlers.errorHandler());
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

