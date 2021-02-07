import { CapeLoader } from "./CapeLoader";
import { addDashesToUuid, Maybe } from "../util";
import { Caching } from "../Caching";
import { TextureInfo } from "../typings/ProfileResponse";

export default class OptifineCapeLoader extends CapeLoader {

    constructor() {
        super("optifine");
    }

    fetchCape(name: string, uuid: string): Promise<Maybe<Buffer>> {
        this.validateName(name);
        return this.loadCapeImage({
            method: "GET",
            url: `http://s.optifine.net/capes/${ name }.png`
        });
    }

    aspectRatio() {
        return 92 / 44;
    }

    coordinates() {
        return {
            front: [1 / 46, 1 / 22, 10 / 46, 16 / 22]
        }
    }

}
