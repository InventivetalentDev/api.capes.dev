const CapeLoader = require("./base");
class MinecraftcapesCapeLoader extends CapeLoader {

    constructor() {
        super("minecraftcapes");
    }

    fetchCape(name, uuid) {
        this.validateUuid(uuid);
        return this.loadCapeImage("https://minecraftcapes.net/profile/"+uuid+"/cape")
    }

}
module.exports = MinecraftcapesCapeLoader;
