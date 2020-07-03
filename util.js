const axios = require("axios");
const hasha = require("hasha");
const crypto = require("crypto");

const nameCache = {};
const nameQueue = {};

// Cache cleanup
setInterval(function () {
    for (let id in nameCache) {
        if ((Date.now() / 1000) - nameCache[id].time > 300) {
            delete nameCache[id];
        }
    }
}, 30000);

// Name fetcher
setInterval(function () {
    for (let id in nameQueue) {
        let callback = nameQueue[id];
        delete nameQueue[id];
        doNameFetch(id, callback);
    }
}, 1000);

function doNameFetch(uuid, callback) {
    axios.get("https://api.mojang.com/user/profiles/" + uuid + "/names").then(resp => {
        let names = resp.data;
        let name = names[names.length - 1].name;
        nameCache[uuid] = name;
        callback(name);
    }).catch(err => {
        console.warn("Failed to fetch name for " + uuid);
        console.warn(err);
    })
}

function nameFromUuid(uuid) {
    return new Promise(resolve => {
        if (nameCache.hasOwnProperty(uuid)) {
            resolve(nameCache[uuid]);
            return;
        }
        nameQueue[uuid] = resolve;
    })
}


function fetchOptifineCape(name) {
    return axios.get({
        method: "get",
        url: "http://s.optifine.net/capes/" + name + ".png",
        responseType: "arraybuffer"
    }).then(resp => Buffer.from(resp.data, "binary"))
}

function bufferHash(buffer) {
    return hasha(buffer);
}

function capeHash(imageHash, uuid, type, time) {
    let content = type + "_" + uuid + "_" + imageHash + "_" + time;
    return crypto.createHash("sha1").update(content).digest("hex");
}

module.exports = {
    nameFromUuid,
    fetchOptifineCape,
    bufferHash,
    capeHash
}
