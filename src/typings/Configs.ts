import * as fs from "fs";
import * as path from "path";
import { Config as SshTunnelConfig } from "tunnel-ssh";
import { ISingleHostConfig } from "influx";
import { Options as GitPullerOptions } from "express-git-puller"

interface MongoConfig {
    useTunnel: boolean;
    tunnel: SshTunnelConfig;

    url?: string;
    user?: string;
    pass?: string;
    address?: string;
    port?: number;
    database: string;

    // connection pool size, defaults to 10
    poolSize?: number;
}

interface SentryConfig {
    dsn: string;
}

export interface CapesConfig {
    port: number;

    mongo: MongoConfig;
    cloudflare: {apiToken: string;accountId:string;accountHash: string;};
    // metrics are disabled when this is missing
    metrics?: ISingleHostConfig;
    sentry: SentryConfig;
    puller: GitPullerOptions & { endpoint: string; };

    // how long to keep serving after SIGTERM, so load balancers can take the instance out first
    shutdownDelay: number;
}

let config: CapesConfig | undefined;

/**
 * Loads config.js (or the file in CONFIG_FILE) if there is one, then applies any
 * environment variable overrides on top, so containers can be configured without a file.
 * Every variable also accepts a <NAME>_FILE variant pointing at a file (e.g. a docker secret).
 */
export function getConfig(): CapesConfig {
    if (!config) {
        config = applyEnv(loadConfigFile());
    }
    return config;
}

function loadConfigFile(): Partial<CapesConfig> {
    const file = path.resolve(process.env.CONFIG_FILE || `${ __dirname }/../../config.js`);
    if (!fs.existsSync(file)) {
        if (process.env.CONFIG_FILE) {
            throw new Error(`CONFIG_FILE ${ file } does not exist`);
        }
        return {};
    }
    return require(file) as Partial<CapesConfig>;
}

function env(name: string): string | undefined {
    const value = process.env[name];
    if (value !== undefined && value !== "") {
        return value;
    }
    const file = process.env[`${ name }_FILE`];
    if (file) {
        return fs.readFileSync(file, "utf8").trim();
    }
    return undefined;
}

function intEnv(name: string): number | undefined {
    const value = env(name);
    if (value === undefined) {
        return undefined;
    }
    const parsed = parseInt(value);
    if (isNaN(parsed)) {
        throw new Error(`${ name } must be a number, got '${ value }'`);
    }
    return parsed;
}

function override<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
    if (value !== undefined) {
        target[key] = value;
    }
}

function applyEnv(base: Partial<CapesConfig>): CapesConfig {
    const c = base as CapesConfig;

    c.port = intEnv("PORT") ?? c.port ?? 3026;
    c.shutdownDelay = intEnv("SHUTDOWN_DELAY") ?? c.shutdownDelay ?? 5000;

    c.mongo = c.mongo || <MongoConfig>{ useTunnel: false };
    override(c.mongo, "url", env("MONGO_URL"));
    override(c.mongo, "user", env("MONGO_USER"));
    override(c.mongo, "pass", env("MONGO_PASS"));
    override(c.mongo, "address", env("MONGO_ADDRESS"));
    override(c.mongo, "port", intEnv("MONGO_PORT"));
    override(c.mongo, "database", env("MONGO_DATABASE"));

    c.cloudflare = c.cloudflare || <CapesConfig["cloudflare"]>{};
    override(c.cloudflare, "accountId", env("CLOUDFLARE_ACCOUNT_ID"));
    override(c.cloudflare, "apiToken", env("CLOUDFLARE_API_TOKEN"));
    override(c.cloudflare, "accountHash", env("CLOUDFLARE_ACCOUNT_HASH"));

    c.sentry = c.sentry || <SentryConfig>{};
    override(c.sentry, "dsn", env("SENTRY_DSN"));

    const influxHost = env("INFLUX_HOST");
    if (influxHost) {
        c.metrics = c.metrics || {};
        c.metrics.host = influxHost;
        override(c.metrics, "port", intEnv("INFLUX_PORT"));
        override(c.metrics, "protocol", env("INFLUX_PROTOCOL") as ISingleHostConfig["protocol"]);
        override(c.metrics, "username", env("INFLUX_USERNAME"));
        override(c.metrics, "password", env("INFLUX_PASSWORD"));
        override(c.metrics, "database", env("INFLUX_DATABASE"));
    }

    return c;
}
