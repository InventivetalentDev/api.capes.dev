import { CapeLoader } from "./CapeLoader";
import { addDashesToUuid, Maybe } from "../util";

export default class SkinMCCapeLoader extends CapeLoader {

    constructor() {
        super("skinmc");
    }

    fetchCape(name: string, uuid: string): Promise<Maybe<Buffer>> {
        this.validateUuid(uuid);
        uuid = addDashesToUuid(uuid);

        return this.loadCapeImage({
            method: "GET",
            url: `https://skinmc.net/api/v1/skinmcCape/${ addDashesToUuid(uuid) }`
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