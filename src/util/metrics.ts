import { IntervalFlusher, Metrics } from "metrics-node";
import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { getConfig } from "../typings/Configs";

const config = getConfig();

export const metricsEnabled = !!config.metrics;
export const metrics = new Metrics(config.metrics!);
const flusher = metricsEnabled ? new IntervalFlusher(metrics, 10000) : undefined;
if (flusher) {
    metrics.setFlusher(flusher);
} else {
    console.warn("No metrics config, not writing metrics to influx");
    // counters only get cleared by flushing, so drop them instead of piling up in memory
    setInterval(() => metrics.metrics.forEach(m => m._cache.clear()), 10000);
}

export async function flushMetrics(): Promise<void> {
    if (flusher) {
        flusher.cancel();
        await flusher.flush();
    }
}


export const API_REQUESTS_METRIC = metrics.metric('capes', 'api_requests');
export const apiRequestsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
        try {
            const route = req.route;
            if (route) {
                const path = route["path"];
                if (path) {
                    const m = API_REQUESTS_METRIC
                        .tag("method", req.method)
                        .tag("path", path)
                        .tag("status", `${res.statusCode}`);
                    if (req && req.headers) {
                        m.tag("userAgent", req.headers["user-agent"] || "?");
                    }
                    m.inc();
                }
            }
        } catch (e) {
            Sentry.captureException(e);
        }
    })
    next();
}
