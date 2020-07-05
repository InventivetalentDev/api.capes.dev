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

}

module.exports = LabymodCapeLoader;
