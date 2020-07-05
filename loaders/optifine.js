const CapeLoader = require("./base");

class OptifineCapeLoader extends CapeLoader {

    constructor() {
        super("optifine");
    }

    fetchCape(name, uuid) {
        this.validateName(name);
        return this.loadCapeImage("http://s.optifine.net/capes/" + name + ".png")
    }

}

module.exports = OptifineCapeLoader;
