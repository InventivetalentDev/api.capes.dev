import * as Sentry from "@sentry/node";
import { Time } from "@inventivetalent/loading-cache";
import { URL } from "url";
import { Maybe } from "./index";

const SNIPPET_LENGTH = 200;

// Axios rejections all share the same createError() stack, so without an explicit
// fingerprint every upstream failure - any host, any status - collapses into one
// issue. Reporting each (source, host, status) at most once per interval keeps a
// permanently broken upstream visible without spending the whole event quota on it.
const REPORT_INTERVAL = Time.minutes(5);

interface ReportState {
    lastReport: number;
    suppressed: number;
}

const reportStates: Map<string, ReportState> = new Map();

function upstreamStatus(err: any): string {
    if (err && err.response && err.response.status) {
        return `${ err.response.status }`;
    }
    if (err && err.code) {
        return err.code; // ECONNABORTED on timeout, ECONNRESET, ENOTFOUND, ...
    }
    return "unknown";
}

function upstreamTarget(err: any): { host: string, method: string, path: string } {
    const config = err ? err.config : undefined;
    const method = ((config && config.method) || "GET").toUpperCase();
    try {
        const url = new URL(config.url, config.baseURL);
        return { host: url.hostname, method: method, path: url.pathname };
    } catch (e) {
        return { host: "unknown", method: method, path: "unknown" };
    }
}

function responseSnippet(data: any): Maybe<string> {
    if (data === undefined || data === null) {
        return undefined;
    }
    try {
        if (Buffer.isBuffer(data)) {
            return data.toString("utf8", 0, SNIPPET_LENGTH);
        }
        if (typeof data === "string") {
            return data.substring(0, SNIPPET_LENGTH);
        }
        return JSON.stringify(data).substring(0, SNIPPET_LENGTH);
    } catch (e) {
        return undefined;
    }
}

/**
 * Report a failed upstream request, tagged with the host and status it failed on and
 * grouped per (source, host, status) rather than per axios stack frame.
 * `source` identifies the caller, e.g. "cape:skinmc" or "cache:userProfile".
 */
export function captureUpstreamError(err: any, source: string, extra?: Record<string, any>): void {
    const target = upstreamTarget(err);
    const status = upstreamStatus(err);

    const key = `${ source }|${ target.host }|${ status }`;
    const now = Date.now();
    const state = reportStates.get(key);
    if (state && now - state.lastReport < REPORT_INTERVAL) {
        state.suppressed++;
        return;
    }
    reportStates.set(key, { lastReport: now, suppressed: 0 });

    Sentry.captureException(err, {
        level: "warning",
        fingerprint: ["upstream", source, target.host, status],
        tags: {
            "upstream.source": source,
            "upstream.host": target.host,
            "upstream.status": status,
            "upstream.method": target.method
        },
        contexts: {
            upstream: {
                source: source,
                host: target.host,
                path: target.path,
                method: target.method,
                status: status,
                statusText: err && err.response ? err.response.statusText : undefined,
                body: responseSnippet(err && err.response ? err.response.data : undefined),
                // how many identical failures happened while this key was throttled
                suppressedSinceLastReport: state ? state.suppressed : 0,
                ...extra
            }
        }
    });
}
