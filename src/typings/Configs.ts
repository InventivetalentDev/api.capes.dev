import { Config as SshTunnelConfig } from "tunnel-ssh";
import { ConfigOptions as CloudinaryConfig } from "cloudinary";
import { ISingleHostConfig } from "influx";


interface MongoConfig {
    useTunnel: boolean;
    tunnel: SshTunnelConfig;

    user: string;
    pass: string;
    address: string;
    port: number;
    database: string;
}

interface SentryConfig {
    dsn: string;
}

export interface CapesConfig {
    port: number;

    mongo: MongoConfig;
    cloudinary: CloudinaryConfig & { preset: string; };
    metrics: ISingleHostConfig;
    sentry: SentryConfig;
}

export function getConfig(): CapesConfig {
    return require("../../config.js") as CapesConfig;
}
