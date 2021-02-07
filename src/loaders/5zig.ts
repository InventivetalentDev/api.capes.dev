import * as Sentry from "@sentry/node";
import { CapeLoader } from "./CapeLoader";
import { addDashesToUuid, Maybe } from "../util";
import { Caching } from "../Caching";
import { TextureInfo } from "../typings/ProfileResponse";

export default class FivezigCapeLoader extends CapeLoader {

    constructor() {
        super("5zig");
    }

    fetchCape(name: string, uuid: string): Promise<Maybe<Buffer>> {
        this.validateUuid(uuid);
        uuid = addDashesToUuid(uuid);// y u do dis

        return Caching.loadCape({
            method: "GET",
            url: `https://textures.5zigreborn.eu/profile/${ uuid }`
        }).then(response => {
            let profile = response.data;
            if (profile && profile.d) {
                return Buffer.from(profile.d, 'base64');
            }
            return undefined;
        }).catch(err => {
            Sentry.captureException(err);
            return undefined;
        })
    }


    get supportsAnimation() {
        return true;
    }

    frameDelay() {
        return 50;
    }

}
