const axios = require("axios");

class CapeLoader {

    constructor(type) {
        this.type = type;
    }

    fetchCape(name, uuid) {
        throw new Error("fetchCape not implemented");
    }

    validateName(name) {
        if (name.length < 2) throw new Error("name too short");
        if (name.length > 16) throw new Error("name too long");
    }

    validateUuid(uuid) {
        if (uuid.length < 32) throw new Error("uuid too short");
        if (uuid.length > 36) throw new Error("uuid too long");
    }

    loadCapeImage(url, method = "GET") {
        return new Promise((resolve, reject) => {
            console.log(method + " " + url);
            axios({
                method: method,
                url: url,
                responseType: "arraybuffer"
            }).then(resp => {
                if (resp.data.length <= 0) {
                    resolve(null);
                    return;
                }
                resolve(Buffer.from(resp.data, "binary"));
            }).catch(err => {
                if (err.response) {
                    let resp = err.response;
                    if (resp.status === 404) {
                        resolve(null);
                    } else {
                        console.warn(this.type + " status: " + resp.status);
                        reject(resp.status);
                    }
                } else {
                    console.warn(err);
                    reject(err);
                }
            })
        })
    }

    supportsAnimation() {
        return false;
    }

    isAnimated(width, height, uuid, name) {
        return height>width;
    }

    frameDelay(uuid, name) {
        return -1;
    }

    aspectRatio(isAnimated, uuid, name) {
        return 64 / 32;
    }

    dynamicCoordinates() {
        return true;
    }

    coordinates(isAnimated, uuid, name) {
        return {
            front: [1 / 64, 1 / 32, 10 / 64, 16 / 32]
        }
    }

}

module.exports = CapeLoader;
