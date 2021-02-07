import { IntervalFlusher, Metrics } from "metrics-node";
import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { getConfig } from "../typings/Configs";

const config = getConfig();

export const metrics = new Metrics(config.metrics);
const flusher = new IntervalFlusher(metrics, 10000);
metrics.setFlusher(flusher);


export const API_REQUESTS_METRIC = metrics.metric('capes', 'api_requests');
export const apiRequestsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        const route = req.route;
        if (route) {
            const path = route["path"];
            if (path) {
                API_REQUESTS_METRIC
                    .tag("method", req.method)
                    .tag("path", path)
                    .inc();
            }
        }
    } catch (e) {
        Sentry.captureException(e);
    }
    next();
}
