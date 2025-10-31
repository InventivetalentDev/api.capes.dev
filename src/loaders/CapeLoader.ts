import { Maybe } from "../util";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { Requests } from "../Requests";
import * as Sentry from "@sentry/node";
import { Coordinates, Transforms } from "../typings";
import { debug } from "../util/colors";
import { Caching } from "../Caching";

export abstract class CapeLoader {

    protected constructor(readonly type: string) {
        console.log(debug(`Registered ${ type } cape loader in ${ (<any>this).constructor.name }`));
    }

    abstract fetchCape(name: string, uuid: string, extraData: Record<string, string>): Promise<Maybe<Buffer>>;

    async loadCapeImage(request: AxiosRequestConfig): Promise<Maybe<Buffer>> {
        request.responseType = "arraybuffer";
        return Caching.loadCape(request)
            .then(response => {
                if (!response) {
                    return undefined;
                }
                if (response.data.length <= 0) {
                    return undefined;
                }
                return Buffer.from(response.data, "binary");
            })
            .catch(err => {
                if (err.response) {
                    if (err.response.status === 404) {
                        return undefined;
                    }
                }
                Sentry.captureException(err);
                return undefined;
            })
    }

    validateName(name: string): void {
        if (name.length < 2) throw new Error("name too short");
        if (name.length > 16) throw new Error("name too long");
    }

    validateUuid(uuid: string): void {
        if (uuid.length < 32) throw new Error("uuid too short");
        if (uuid.length > 36) throw new Error("uuid too long");
    }

    get supportsAnimation(): boolean {
        return false;
    }

    get dynamicCoordinates(): boolean {
        return true;
    }

    isAnimated(width: number, height: number, uuid: string, name: string): boolean | Promise<boolean> {
        return height > width;
    }

    frameDelay(uuid?: string, name?: string): number | Promise<number> {
        return -1;
    }

    aspectRatio(isAnimated: boolean = false, uuid?: string, name?: string): number | Promise<number> {
        return 64 / 32;
    }

    coordinates(isAnimated: boolean = false, uuid?: string, name?: string): Transforms | Promise<Transforms> {
        return {
            front: [1 / 64, 1 / 32, 10 / 64, 16 / 32]
        }
    }

}
