import { CapeLoader } from "./CapeLoader";
import { Maybe } from "../util";
import { Caching } from "../Caching";
import { TextureInfo } from "../typings/ProfileResponse";

export  default class MinecraftCapeLoader extends CapeLoader {

    constructor() {
        super("minecraft");
    }

    fetchCape(name: string, uuid: string): Promise<Maybe<Buffer>> {
        this.validateUuid(uuid);

        return Caching.getUserProfile(uuid).then(profile => {
            const decoded = Buffer.from(profile.value, 'base64').toString('ascii');
            const textureInfo = JSON.parse(decoded) as TextureInfo;
            if (textureInfo.textures && textureInfo.textures.CAPE) {
                const cape = textureInfo.textures.CAPE;
                if (cape.url) {
                    return this.loadCapeImage({
                        url: cape.url
                    });
                }
            }
            return undefined;
        })
    }

}
