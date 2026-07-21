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
}

interface SentryConfig {
    dsn: string;
}

export interface CapesConfig {
    port: number;

    mongo: MongoConfig;
    cloudflare: {apiToken: string;accountId:string;accountHash: string;};
    metrics: ISingleHostConfig;
    sentry: SentryConfig;
    puller: GitPullerOptions & { endpoint: string; };
}

export function getConfig(): CapesConfig {
    return require("../../config.js") as CapesConfig;
}
