import "./instrument"

import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import * as sourceMapSupport from "source-map-support";
import { getConfig } from "./typings/Configs";
import gitsha from "@inventivetalent/gitsha";
import * as express from "express";
import "express-async-errors";
import { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import { apiRequestsMiddleware, flushMetrics } from "./util/metrics";
import { corsMiddleware, getIp, INSTANCE_ID } from "./util";
import { error, info, warn } from "./util/colors";
import { CapeError } from "./typings/CapeError";
import { statsRoute, getRoute, imgRoute, typesRoute, loadRoute, historyRoute } from "./routes";
import connectToMongo from "./database";
import * as bodyParser from "body-parser";
import { Puller } from "express-git-puller";
import * as mongoose from "mongoose";
import { Server } from "http";
import { LeaderTask } from "./LeaderTask";

sourceMapSupport.install();

const config = getConfig();

let updatingApp = true;
let shuttingDown = false;
let server: Server | undefined;

console.log("\n" +
    "  ==== STARTING UP ==== " +
    "\n");

const app: Express = express();

async function init() {
    console.log("Node Version " + process.version);
    console.log("Instance " + INSTANCE_ID);

    {
        console.log("Registering health checks");

        // liveness: the process is up and handling requests
        app.get("/health", (req, res) => {
            res.json({status: "ok"});
        });
        // readiness: this instance should receive traffic
        app.get("/ready", (req, res) => {
            const ready = !updatingApp && !shuttingDown && mongoose.connection.readyState === 1;
            res.status(ready ? 200 : 503).json({status: ready ? "ready" : (shuttingDown ? "shutting down" : "not ready")});
        });
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
        mongoose.connection.on("reconnectFailed", () => {
            // the driver gave up reconnecting, restart so the supervisor can start a fresh connection
            shutdown("mongodb reconnect failed", 1);
        });
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

}

async function shutdown(reason: string, exitCode: number = 0, delay: number = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(warn(`Shutting down (${ reason })`));
    setTimeout(() => {
        console.error(error("Graceful shutdown timed out, exiting"));
        process.exit(exitCode || 1);
    }, delay + 20000).unref();

    try {
        // hand background jobs over to other instances right away
        await LeaderTask.stopAll();
    } catch (e) {
        Sentry.captureException(e);
    }

    if (delay > 0) {
        // /ready reports 503 now; keep serving until load balancers have noticed
        console.log(`Draining for ${ delay }ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (server) {
        // stops accepting connections and waits for in-flight requests
        await new Promise(resolve => server!.close(resolve));
    }

    try {
        await flushMetrics();
    } catch (e) {
        Sentry.captureException(e);
    }
    await mongoose.disconnect();
    await Sentry.close(2000);
    console.log("Bye!");
    process.exit(exitCode);
}

process.on("SIGTERM", () => shutdown("SIGTERM", 0, config.shutdownDelay));
process.on("SIGINT", () => shutdown("SIGINT"));

init().then(() => {
    setTimeout(() => {
        console.log("Starting app");
        server = app.listen(config.port, function () {
            console.log(info(" ==> listening on *:" + config.port + "\n"));
            setTimeout(() => {
                updatingApp = false;
                console.log(info("Accepting connections."));
            }, 200);
        });
    }, 200);
}).catch(async e => {
    // exit instead of idling without a server, so the supervisor restarts us
    console.error(error("Failed to start"), e);
    Sentry.captureException(e);
    await Sentry.close(2000);
    process.exit(1);
});

