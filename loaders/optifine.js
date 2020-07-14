const CapeLoader = require("./base");

class OptifineCapeLoader extends CapeLoader {

    constructor() {
        super("optifine");
    }

    fetchCape(name, uuid) {
        this.validateName(name);
        return this.loadCapeImage("http://s.optifine.net/capes/" + name + ".png")
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

module.exports = OptifineCapeLoader;
