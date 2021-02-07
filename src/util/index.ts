import { Request, Response, NextFunction } from "express";
import { CapeInfo } from "../typings/CapeInfo";
import { ICapeDocument } from "../typings/ICapeDocument";

export const HAS_NO_CAPE = "hasN0Cape";

export type Maybe<T> = T | undefined;


export function stripUuid(uuid: string): string {
    return uuid.replace(/-/g, "");
}

export function addDashesToUuid(uuid: string): string {
    if (uuid.length >= 36) return uuid; // probably already has dashes
    return uuid.substr(0, 8) + "-" + uuid.substr(8, 4) + "-" + uuid.substr(12, 4) + "-" + uuid.substr(16, 4) + "-" + uuid.substr(20);
}

export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE, PUT");
        res.header("Access-Control-Allow-Headers", "X-Requested-With, Accept, Content-Type, Origin");
        res.header("Access-Control-Request-Headers", "X-Requested-With, Accept, Content-Type, Origin");
        return res.sendStatus(200);
    } else {
        return next();
    }
};

export function formatMeta(meta: any) {
    let formattedMetaArr = [];
    for (let m in meta) {
        formattedMetaArr.push(m + "=" + meta[m]);
    }
    return formattedMetaArr.join("|");
}

export function getIp(req: Request): string {
    return req.get('cf-connecting-ip') || req.get('x-forwarded-for') || req.get("x-real-ip") || req.connection.remoteAddress || req.ip;
}
