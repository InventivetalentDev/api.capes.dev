const axios = require("axios");
const hasha = require("hasha");
const crypto = require("crypto");

const nameCache = {}; // uuid -> name
const uuidCache = {}; // name -> uuid
const nameQueue = {}; // uuid -> callback(name)
const uuidQueue = {}; // name -> callback(uuid)

// Cache cleanup
setInterval(function () {
    let now = (Date.now() / 1000);
    for (let id in nameCache) {
        if (now - nameCache[id].time > 300) {
            delete nameCache[id];
        }
    }
    for (let name in uuidCache) {
        if (now - uuidCache[name].time > 400) {
            delete uuidCache[name];
        }
    }
}, 60000);

// Name fetcher
setInterval(function () {
    let length = Object.keys(nameQueue).length;
    if (length > 0) {
        console.log("Fetching " + length + " names from uuids...");
        for (let id in nameQueue) {
            let callback = nameQueue[id];
            delete nameQueue[id];
            doNameFetch(id, callback);
        }
    }
}, 1000);
// UUID fetcher
setInterval(function () {
    let keys = Object.keys(uuidQueue);
    let length = keys.length;
    if (length > 0) {
        console.log("Fetching " + length + " uuids from names...");
        doUuidFetch(keys);
    }
}, 2000);

function doNameFetch(uuid, callback) {
    let url = "https://api.mojang.com/user/profiles/" + uuid + "/names";
    console.log("GET " + url);
    axios.get(url).then(resp => {
        let names = resp.data;
        let name = names[names.length - 1].name.toLowerCase();
        let time = Math.floor(Date.now() / 1000);
        nameCache[uuid] = {
            name: name,
            time: time
        };
        uuidCache[name] = {
            uuid: uuid,
            time: time
        };
        callback(name);
    }).catch(err => {
        console.warn("Failed to fetch name for " + uuid);
        console.warn(err);
    })
}

function doUuidFetch(names) {
    let url = "https://api.mojang.com/profiles/minecraft";
    console.log("POST " + url);
    axios.post(url, names).then(resp => {
        let result = resp.data;
        let time = Math.floor(Date.now() / 1000);
        for (let res of result) {
            let name = res.name.toLowerCase();
            nameCache[res.id] = {
                name: name,
                time: time
            };
            uuidCache[name] = {
                uuid: res.id,
                time: time
            };
            let callback = uuidQueue[name];
            if (callback) {
                callback(res.id);
            }
            delete uuidQueue[name];
        }
    }).catch(err => {
        console.warn("Failed to fetch uuids");
        console.warn(err);
    })
}

function nameAndUuid(nameOrUuid) {
    let promises = [];

    if (nameOrUuid.length < 20) { // name
        promises.push(justResolve(nameOrUuid));
        promises.push(uuidFromName(nameOrUuid));
    }else{ // uuid
        promises.push(nameFromUuid(nameOrUuid));
        promises.push(justResolve(nameOrUuid));
    }

    return Promise.all(promises);
}

function nameFromUuid(uuid) {
    if(uuid.length <32) throw new Error("uuid too short");
    if(uuid.length >36) throw new Error("uuid too long");
    return new Promise(resolve => {
        if (nameCache.hasOwnProperty(uuid)) {
            resolve(nameCache[uuid].name);
            return;
        }
        nameQueue[uuid] = resolve;
    })
}

function uuidFromName(name) {
    if(name.length > 16) throw new Error("name too long");
    name = name.toLowerCase();
    return new Promise(resolve => {
        if (uuidCache.hasOwnProperty(name)) {
            resolve(uuidCache[name].uuid);
            return;
        }
        nameQueue[name] = resolve;
    })
}

function justResolve(x) {
    return new Promise(resolve => {
        resolve(x);
    })
}

function fetchOptifineCape(name) {
    if(name.length > 16) throw new Error("name too long");
    let url = "http://s.optifine.net/capes/" + name + ".png";
    console.log("GET " + url);
    return axios({
        method: "get",
        url: url,
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
    uuidFromName,
    nameAndUuid,
    fetchOptifineCape,
    bufferHash,
    capeHash
}
