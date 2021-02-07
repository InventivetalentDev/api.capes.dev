import * as Sentry from "@sentry/node";
import { CapeLoader } from "./CapeLoader";
import { addDashesToUuid, Maybe } from "../util";
import { Caching } from "../Caching";
import { TextureInfo } from "../typings/ProfileResponse";
import { Caches, SimpleCache, Time } from "@inventivetalent/loading-cache";
import { AxiosResponse } from "axios";
import { Transforms } from "../typings";

export class TlauncherCapeLoader extends CapeLoader {

    constructor() {
        super("tlauncher");
    }

    fetchCape(name: string, uuid: string): Promise<Maybe<Buffer>> {
        this.validateName(name);
        return this.getCapeData(name).then(capeData => {
            if (!capeData) {
                return undefined;
            }
            return this.loadCapeImage({
                method: "GET",
                url: capeData.CAPE!.url!
            });
        })
    }

    private async getCapeData(name: string): Promise<Maybe<TlauncherCapeData>> {
        return Caching.loadCape({
            method: "GET",
            url: `http://auth.tlauncher.org/skin/profile/texture/login/${ name }`
        }).then(response => {
            let profile = response.data;
            if (profile && profile.CAPE) {
                return profile as TlauncherCapeData;
            }
            return undefined;
        }).catch(err => {
            Sentry.captureException(err);
            return undefined;
        })
    }

    get supportsAnimation(): boolean {
        return true;
    }

    async aspectRatio(isAnimated: boolean = false, uuid?: string, name?: string): Promise<number> {
        if (isAnimated) {
            let data = await this.getCapeData(name!);
            if (data && data.CAPE?.capeHeight) {
                return 352 / data.CAPE.capeHeight;
            }
            return 352 / 272;
        }
        return 64 / 32;
    }

    async isAnimated(width: number, height: number, uuid: string, name: string): Promise<boolean> {
        let data = await this.getCapeData(name);
        return !!data && data.CAPE?.animatedCape!;
    }

    async frameDelay(uuid?: string, name?: string): Promise<number> {
        let data = await this.getCapeData(name!);
        if (data && data.CAPE?.fps) {
            return 1 / data.CAPE.fps * 1000;
        }
        return 100;
    }

    async coordinates(isAnimated: boolean = false, uuid?: string, name?: string): Promise<Transforms> {
        if (isAnimated) {
            let data = await this.getCapeData(name!);
            if (data && data.CAPE?.capeHeight) {
                return {
                    front: [16 / 352, 16 / data.CAPE?.capeHeight, 160 / 352, 256 / data.CAPE?.capeHeight]
                }
            }
            return {
                front: [16 / 352, 16 / 272, 160 / 352, 256 / 272]
            }
        } else {
            return {
                front: [1 / 64, 1 / 32, 10 / 64, 16 / 32]
            }
        }
    }

}


interface TlauncherCapeData {
    CAPE?: {
        url: string;
        animatedCape?: boolean;
        capeHeight?: number;
        fps?: number;
    }
}
