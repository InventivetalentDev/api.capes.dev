const CapeLoader = require("./base");
const util = require("../util")

class LabymodCapeLoader extends CapeLoader {

    constructor() {
        super("labymod");
    }

    fetchCape(name, uuid) {
        this.validateUuid(uuid);
        uuid = util.addUuidDashes(uuid);// y u do dis
        return this.loadCapeImage("https://dl.labymod.net/capes/" + uuid)
    }

    coordinates() {
        return {
            front: [1 / 22, 1 / 17, 10 / 22, 16 / 16]
        };
    }

}

module.exports = LabymodCapeLoader;
