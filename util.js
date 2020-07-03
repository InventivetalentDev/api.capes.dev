const axios = require("axios");
const hasha = require("hasha");
const crypto = require("crypto");
const bufferImageSize = require("buffer-image-size");

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
    if(uuid.length <32) throw new Error("uuid too short");
    if(uuid.length >36) throw new Error("uuid too long");
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
        uuidQueue[name] = resolve;
    })
}

function justResolve(x) {
    return new Promise(resolve => {
        resolve(x);
    })
}

function fetchCape(type, uuid, name) {
    switch (type) {
        case "optifine":
            return fetchOptifineCape(name);
        case "minecraftcapes":
            return fetchMinecraftcapesCape(uuid);
        default:
            throw new Error("unknown cape type");
    }
}

function fetchOptifineCape(name) {
    if(name.length > 16) throw new Error("name too long");
    let url = "http://s.optifine.net/capes/" + name + ".png";
    console.log("GET " + url);
    return new Promise(resolve => {
        axios({
            method: "get",
            url: url,
            responseType: "arraybuffer"
        }).then(resp => {
            resolve(Buffer.from(resp.data, "binary"));
        }).catch(err=>{
            if(err.response) {
                let resp = err.response;
                console.warn("failed to get optifine cape for " + name);
                if (resp.status === 404) {
                    resolve(null);
                } else {
                    console.warn("optifine status: " + resp.status);
                }
            }else{
                console.warn(err);
            }
        })
    })
}

function fetchMinecraftcapesCape(uuid) {
    if(uuid.length <32) throw new Error("uuid too short");
    if(uuid.length >36) throw new Error("uuid too long");
    let url = "https://minecraftcapes.net/profile/"+uuid+"/cape";
    console.log("GET " + url);
    return new Promise(resolve => {
        axios({
            method: "get",
            url: url,
            responseType: "arraybuffer"
        }).then(resp => {
            resolve(Buffer.from(resp.data, "binary"));
        }).catch(err=>{
            if(err.response) {
                let resp = err.response;
                console.warn("failed to get minecraftcapes cape for " + uuid);
                if (resp.status === 404) {
                    resolve(null);
                } else {
                    console.warn("minecraftcapes status: " + resp.status);
                }
            }else{
                console.warn(err);
            }
        })
    })
}

function bufferHash(buffer) {
    return hasha(buffer);
}

function bufferDimensions(buffer) {
    return bufferImageSize(buffer);
}

function capeHash(imageHash, uuid, type, time) {
    let content = type + "_" + uuid + "_" + imageHash + "_" + time;
    return crypto.createHash("sha1").update(content).digest("hex");
}

module.exports = {
    nameFromUuid,
    uuidFromName,
    nameAndUuid,
    fetchCape,
    bufferHash,
    bufferDimensions,
    capeHash
}
