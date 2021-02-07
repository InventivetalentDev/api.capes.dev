import { CapeLoader } from "./CapeLoader";
import { addDashesToUuid, Maybe } from "../util";
import { Caching } from "../Caching";
import { TextureInfo } from "../typings/ProfileResponse";

export class LabymodCapeLoader extends CapeLoader {

    constructor() {
        super("labymod");
    }

    fetchCape(name: string, uuid: string): Promise<Maybe<Buffer>> {
        this.validateUuid(uuid);
        uuid = addDashesToUuid(uuid);// y u do dis

        return this.loadCapeImage({
            method: "GET",
            url: `https://dl.labymod.net/capes/${ uuid }`
        });
    }


    aspectRatio() {
        return 88 / 68;
    }

    coordinates() {
        return {
            front: [1 / 22, 1 / 17, 10 / 22, 16 / 16]
        };
    }

}
