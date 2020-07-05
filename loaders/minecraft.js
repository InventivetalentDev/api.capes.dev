const CapeLoader = require("./base");
const axios = require("axios");

class MinecraftCapeLoader extends CapeLoader {

    constructor() {
        super("minecraft");
    }

    fetchCape(name, uuid) {
        this.validateUuid(uuid);
        return new Promise(resolve => {
            let url = "https://sessionserver.mojang.com/session/minecraft/profile/"+uuid;
            console.log("GET " + url);
            axios.get(url).then(resp=>{
                let profile = resp.data;
                console.log(profile);
                if (profile && profile.properties) {
                    if (profile.properties.length > 0) {
                        let base64 = profile.properties[0].value;
                        let decoded = new Buffer(base64, 'base64').toString('ascii');
                        let textureInfo = JSON.parse(decoded);
                        console.log(textureInfo);
                        if (textureInfo.textures && textureInfo.textures.CAPE) {
                            let cape = textureInfo.textures.CAPE;
                            console.log(cape);
                            if (cape.url) {
                                this.loadCapeImage(cape.url).then(resolve);
                                return;
                            }
                        }
                    }
                }
                resolve(null);
            });
        })
    }

}

module.exports = MinecraftCapeLoader;
