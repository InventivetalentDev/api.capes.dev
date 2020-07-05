const CapeLoader = require("./base");
const axios = require("axios");
const util = require("../util")

class FivezigCapeLoader extends CapeLoader {

    constructor() {
        super("5zig");
    }

    fetchCape(name, uuid) {
        this.validateUuid(uuid);
        uuid = util.addUuidDashes(uuid);// y u do dis
        return new Promise(resolve => {
            axios.get("https://textures.5zigreborn.eu/profile/" + uuid).then(resp => {
                let profile = resp.data;
                if (profile && profile.d) {
                    resolve(Buffer.from(profile.d, 'base64'));
                } else {
                    resolve(null);
                }
            }).catch(err => {
                resolve(null);
            })
        })
    }

}

module.exports = FivezigCapeLoader;
