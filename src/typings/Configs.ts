import * as fs from "fs";
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
    database?: string;

    // connection pool size, defaults to 10
    poolSize?: number;
}

interface SentryConfig {
    dsn?: string;
}

export interface CapesConfig {
    port: number;

    mongo: MongoConfig;
    cloudflare: {apiToken?: string;accountId?:string;accountHash?: string;};
    metrics: ISingleHostConfig;
    sentry: SentryConfig;
    puller?: GitPullerOptions & { endpoint: string; };
}

let config: CapesConfig | undefined;

export function getConfig(): CapesConfig {
    if (!config) {
        // treat empty variables (e.g. `INFLUX_HOST=` in .env) as unset
        const env: NodeJS.ProcessEnv = {};
        Object.keys(process.env).forEach(key => {
            if (process.env[key]) {
                env[key] = process.env[key];
            }
        });
        config = loadConfig(env);
    }
    return config;
}

function int(value: string | undefined): number | undefined {
    return value ? parseInt(value) : undefined;
}

function loadConfig(env: NodeJS.ProcessEnv): CapesConfig {
    return {
        port: int(env.PORT) || 3026,
        mongo: {
            url: env.MONGO_URL,
            poolSize: int(env.MONGO_POOL_SIZE),
            useTunnel: !!env.MONGO_TUNNEL_HOST,
            tunnel: {
                host: env.MONGO_TUNNEL_HOST,
                port: int(env.MONGO_TUNNEL_PORT) || 22,
                username: env.MONGO_TUNNEL_USERNAME,
                privateKey: env.MONGO_TUNNEL_KEY_FILE ? fs.readFileSync(env.MONGO_TUNNEL_KEY_FILE) : undefined,
                dstPort: int(env.MONGO_TUNNEL_DST_PORT) || 27017
            }
        },
        cloudflare: {
            accountId: env.CLOUDFLARE_ACCOUNT_ID,
            apiToken: env.CLOUDFLARE_API_TOKEN,
            accountHash: env.CLOUDFLARE_ACCOUNT_HASH
        },
        // unset fields fall back to the influx client's defaults (http://127.0.0.1:8086)
        metrics: {
            host: env.INFLUX_HOST,
            port: int(env.INFLUX_PORT),
            protocol: env.INFLUX_PROTOCOL as ISingleHostConfig["protocol"],
            username: env.INFLUX_USERNAME,
            password: env.INFLUX_PASSWORD,
            database: env.INFLUX_DATABASE
        },
        sentry: {
            dsn: env.SENTRY_DSN
        }
    };
}
