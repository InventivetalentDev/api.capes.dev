const CapeLoader = require("./base");
const axios = require("axios");
const util = require("../util")

class TlauncherCapeLoader extends CapeLoader {

    constructor() {
        super("tlauncher");
        this.capeCache = {};
        setInterval(() => {
            for (let id in this.capeCache) {
                let cached = this.capeCache[id];
                if (Date.now() - cached.time > 60000) {
                    delete this.capeCache[id];
                }
            }
        }, 30000);
    }

    fetchCape(name, uuid) {
        this.validateName(name);
        return new Promise(resolve => {
            axios.get("http://auth.tlauncher.org/skin/profile/texture/login/" + name).then(resp => {
                let profile = resp.data;
                if (profile && profile.CAPE && profile.CAPE.url) {
                    let toCache = profile.CAPE;
                    toCache.time = Date.now();
                    this.capeCache[name.toLowerCase()] = toCache;
                    this.loadCapeImage(profile.CAPE.url).then(resolve).catch(err => resolve(null));
                } else {
                    resolve(null);
                }
            }).catch(err => {
                resolve(null);
            })
        })
    }

    aspectRatio(isAnimated, uuid, name) {
        if (isAnimated) {
            let cached = this.capeCache[name.toLowerCase()];
            if (cached && cached.capeHeight) {
                return 352/cached.capeHeight;
            }
            return 352/272;
        }
        return 64 / 32;
    }

    supportsAnimation() {
        return true;
    }

    isAnimated(width, height, uuid, name) {
        let cached = this.capeCache[name.toLowerCase()];
        return cached && cached.animatedCape;
    }

    frameDelay(uuid, name) {
        let cached = this.capeCache[name.toLowerCase()];
        if(cached && cached.fps){
            return cached.fps / 1000; // FPS -> Delay
        }
        return 100;
    }

    coordinates(isAnimated, uuid, name) {
        if(isAnimated) {
            let cached = this.capeCache[name.toLowerCase()];
            if (cached && cached.capeHeight) {
                return {
                    front: [16 / 352, 16 / cached.capeHeight, 160 / 352, 256 / cached.capeHeight]
                }
            }
            return {
                front: [16 / 352, 16 / 272, 160 / 352, 256 / 272]
            }
        }else{
            return {
                front: [1 / 64, 1 / 32, 10 / 64, 16 / 32]
            }
        }
    }

}

module.exports = TlauncherCapeLoader;
