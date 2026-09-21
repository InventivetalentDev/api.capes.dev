import { getConfig } from "./typings/Configs";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { execSync } from "child_process";

const config = getConfig();

// Sentry patches express (and http) as they are required, so init has to finish
// before index.ts imports them. Awaiting the release sha here used to defer init
// past those imports, which left express uninstrumented - no per-request scopes,
// so setTag() in the error handler leaked tags onto unrelated background events.
function releaseSha(): string | undefined {
    try {
        return execSync("git rev-parse --short HEAD", {
            cwd: `${ __dirname }/..`,
            stdio: ["ignore", "pipe", "ignore"]
        }).toString().trim();
    } catch (e) {
        return process.env.GIT_SHA;
    }
}

console.log("Initializing Sentry")
Sentry.init({
    dsn: config.sentry.dsn,
    release: releaseSha(),
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
