import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import * as sourceMapSupport from "source-map-support";
import { getConfig } from "./typings/Configs";
import gitsha from "@inventivetalent/gitsha";
import * as express from "express";
import "express-async-errors";
import { Request, Response, ErrorRequestHandler, Express, NextFunction } from "express";
import { apiRequestsMiddleware } from "./util/metrics";
import { corsMiddleware } from "./util";
import { info, warn } from "./util/colors";
import { CapeError } from "./typings/CapeError";
import { v2 as cloudinary } from "cloudinary";
import { statsRoute, getRoute, imgRoute, typesRoute, loadRoute, historyRoute } from "./routes";
import connectToMongo from "./database";

sourceMapSupport.install();

const config = getConfig();


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
            //release: await gitsha(),
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

        app.use("/.well-known", express.static(".well-known"));
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
        })

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
        });
    }, 200);
});

