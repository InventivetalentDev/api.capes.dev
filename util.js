const config = require("./config");
const axios = require("axios");
const hasha = require("hasha");
const crypto = require("crypto");
const bufferImageSize = require("buffer-image-size");
const fileType = require("file-type");
const cloudinary = require("cloudinary").v2;
const JobQueue = require("jobqu");

const nameCache = {}; // uuid -> name
const uuidCache = {}; // name -> uuid
const nameQueue = new JobQueue(doNameFetch, 1000)
const uuidQueue = new JobQueue(doUuidFetch, 2000, -1, true);

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

function doNameFetch(uuid) {
    if(uuid.length <32) throw new Error("uuid too short");
    if(uuid.length >36) throw new Error("uuid too long");
    return new Promise((resolve, reject) =>{
        let url = "https://api.mojang.com/user/profiles/" + uuid + "/names";
        console.log("GET " + url);
        axios.get(url).then(resp => {
            let names = resp.data;
            let name = names[names.length - 1].name;
            let key = name.toLowerCase();
            let time = Math.floor(Date.now() / 1000);
            nameCache[uuid] = {
                name: name,
                time: time
            };
            uuidCache[key] = {
                uuid: uuid,
                time: time
            };
            resolve(name);
        }).catch(err => {
            console.warn("Failed to fetch name for " + uuid);
            console.warn(err);
            resolve(null);
        })
    })
}

function doUuidFetch(names) {
    return new Promise((resolve, reject) => {
        let url = "https://api.mojang.com/profiles/minecraft";
        console.log("POST " + url + " " + names);
        axios.post(url, names).then(resp => {
            let result = resp.data;
            let time = Math.floor(Date.now() / 1000);
            let data = {};
            for (let res of result) {
                let name = res.name;
                let key = name.toLowerCase();
                nameCache[res.id] = {
                    name: name,
                    time: time
                };
                uuidCache[key] = {
                    uuid: res.id,
                    time: time
                };
                data[key] = res.id;
            }
            resolve(data);
        }).catch(err => {
            console.warn("Failed to fetch uuids");
            console.warn(err);
            resolve(null);
        })
    })
}

function nameAndUuid(nameOrUuid) {
   return new Promise((resolve, reject) => {
       if (nameOrUuid.length < 20) { // name
           uuidFromName(nameOrUuid).then(uuid => {
               let cached = nameCache[uuid];
               resolve([cached ? cached.name : null, uuid]);
           }).catch(reject);
       }else{ // uuid
           nameFromUuid(nameOrUuid).then(name=>{
               let cached = uuidCache[name.toLowerCase()];
               resolve([name, cached ? cached.uuid : null]);
           })
       }
   })
}

function nameFromUuid(uuid) {
    if(uuid.length <32) throw new Error("uuid too short");
    if(uuid.length >36) throw new Error("uuid too long");
    return new Promise(resolve => {
        if (nameCache.hasOwnProperty(uuid)) {
            resolve(nameCache[uuid].name);
            return;
        }
        nameQueue.add(uuid).then(name => resolve(name)).catch(err =>{
            console.warn(err);
            resolve(null);
        });
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
        uuidQueue.add(name).then(uuid => resolve(uuid)).catch(err =>{
            console.warn(err);
            resolve(null);
        });
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
        case "labymod":
            return fetchLabyModCape(uuid);
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

function fetchLabyModCape(uuid) {
    if(uuid.length <32) throw new Error("uuid too short");
    if(uuid.length >36) throw new Error("uuid too long");
    uuid = addUuidDashes(uuid);// y u do dis
    let url = "https://dl.labymod.net/capes/" + uuid;
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
                console.warn("failed to get labymod cape for " + uuid);
                if (resp.status === 404) {
                    resolve(null);
                } else {
                    console.warn("labymod status: " + resp.status);
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

function bufferFileExtension(buffer, ignoreMime) {
    return new Promise(resolve => {
        if (!buffer) {
            resolve(null);
            return;
        }
        fileType.fromBuffer(buffer).then(info=>{
            if (info) {
                if(!ignoreMime && !info.mime.startsWith("image")){
                    console.warn("File type was not an image, was " + info.mime);
                    resolve(null);
                } else {
                    resolve(info.ext);
                }
            }else{
                resolve(null);
            }
        }).catch(err=>{
            console.warn("unable to determine file type");
            console.warn(err);
            resolve(null);
        });
    })
}

function capeHash(imageHash, uuid, type, time) {
    let content = type + "_" + uuid + "_" + imageHash + "_" + time;
    return crypto.createHash("sha1").update(content).digest("hex");
}

function addUuidDashes(uuid) {
    // https://github.com/timmyRS/add-dashes-to-uuid/blob/master/index.js
    return uuid.substr(0,8)+"-"+uuid.substr(8,4)+"-"+uuid.substr(12,4)+"-"+uuid.substr(16,4)+"-"+uuid.substr(20)
}

function uploadTransformImage(name, type, transform, buffer) {
    return new Promise(resolve => {
        cloudinary.uploader.upload_stream({
            upload_preset: config.cloudinary.preset,
            public_id: name + "_" + transform,
            tags: ["cape", type, transform],
            transformation: "cape_" + transform + "_" + type
        }, function (err, result) {
            if (err) {
                console.warn("cloudinary upload failed");
                console.warn(err);
                resolve(null);
                return;
            }
            resolve(result);
        }).end(buffer);
    })
}

function uploadImage(name, type, buffer) {
  return new Promise(resolve => {
      cloudinary.uploader.upload_stream({
          upload_preset: config.cloudinary.preset,
          public_id: name,
          tags: ["cape", type]
      }, function (err, result) {
          if (err) {
              console.warn("cloudinary upload failed");
              console.warn(err);
              resolve(null);
              return;
          }
          resolve(result);
      }).end(buffer);
  })
}

module.exports = {
    nameFromUuid,
    uuidFromName,
    nameAndUuid,
    fetchCape,
    bufferHash,
    bufferDimensions,
    bufferFileExtension,
    capeHash,
    uploadImage,
    uploadTransformImage
}
