import { getConfig } from "./typings/Configs";
import * as Sentry from "@sentry/node";
import gitsha from "@inventivetalent/gitsha";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

const config = getConfig();

(async () => {
    console.log("Initializing Sentry")
    Sentry.init({
        dsn: config.sentry.dsn,
        release: await gitsha(),
        integrations: [
           nodeProfilingIntegration()
        ],
        tracesSampleRate: 0.02,
        sampleRate: 0.5,
        ignoreErrors: [
            "invalid_player",
            "failed with status code 404"
        ]
    });
})();