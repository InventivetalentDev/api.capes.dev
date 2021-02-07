import { CapeLoader } from "./CapeLoader";
import { addDashesToUuid, Maybe } from "../util";
import { Caching } from "../Caching";
import { TextureInfo } from "../typings/ProfileResponse";

export default class MinecraftcapesCapeLoader extends CapeLoader {

    constructor() {
        super("minecraftcapes");
    }

    fetchCape(name: string, uuid: string): Promise<Maybe<Buffer>> {
        this.validateUuid(uuid);
        return this.loadCapeImage({
            method: "GET",
            url: `https://minecraftcapes.net/profile/${ uuid }/cape`
        });
    }

    get supportsAnimation() {
        return true;
    }

    frameDelay() {
        return 100;
    }


}
