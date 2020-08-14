const config = require("./config");
const axios = require("axios");
const hasha = require("hasha");
const crypto = require("crypto");
const GIFEncoder = require("gifencoder");
const {createCanvas, Image} = require("canvas");
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
    if (uuid.length < 32) throw new Error("uuid too short");
    if (uuid.length > 36) throw new Error("uuid too long");
    return new Promise((resolve, reject) => {
        let url = "https://api.mojang.com/user/profiles/" + uuid + "/names";
        console.log("GET " + url);
        axios.get(url).then(resp => {
            let names = resp.data;
            if (!names || names.length === 0) {
                resolve(null);
                return;
            }
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
        } else { // uuid
            nameFromUuid(nameOrUuid).then(name => {
                let cached = uuidCache[name.toLowerCase()];
                resolve([name, cached ? cached.uuid : null]);
            })
        }
    })
}

function nameFromUuid(uuid) {
    console.log("nameFromUuid " + uuid);
    if (uuid.length < 32) throw new Error("uuid too short");
    if (uuid.length > 36) throw new Error("uuid too long");
    return new Promise(resolve => {
        if (nameCache.hasOwnProperty(uuid)) {
            resolve(nameCache[uuid].name);
            return;
        }
        nameQueue.add(uuid).then(name => resolve(name)).catch(err => {
            console.warn(err);
            resolve(null);
        });
    })
}

function uuidFromName(name) {
    console.log("uuidFromName "+name)
    if (name.length > 16) throw new Error("name too long");
    name = name.toLowerCase();
    return new Promise(resolve => {
        if (uuidCache.hasOwnProperty(name)) {
            resolve(uuidCache[name].uuid);
            return;
        }
        uuidQueue.add(name).then(uuid => resolve(uuid)).catch(err => {
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
        fileType.fromBuffer(buffer).then(info => {
            if (info) {
                if (!ignoreMime && !info.mime.startsWith("image")) {
                    console.warn("File type was not an image, was " + info.mime);
                    resolve(null);
                } else {
                    resolve(info.ext);
                }
            } else {
                resolve(null);
            }
        }).catch(err => {
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
    return uuid.substr(0, 8) + "-" + uuid.substr(8, 4) + "-" + uuid.substr(12, 4) + "-" + uuid.substr(16, 4) + "-" + uuid.substr(20)
}

/**
 * Uploads
 * - <hash>_<transform>
 */
function handleStillCape(name, type, aspectRatio, coordinates, dynamicCoordinates, capeSize, buffer) {
    let promises = [];
    for (let transform in coordinates) {
        let transformation = coordinates[transform];
        promises.push(uploadTransformImage(name, type, transform, transformation, dynamicCoordinates, capeSize, buffer, null, {type:type,transform:transform}));
    }
    return Promise.all(promises);
}

/**
 * If the image is animated, uploads
 * - <hash>_animated
 * - <hash>_<transform>_animated...
 */
function handleAnimatedCape(name, type, expectedAspectRatio, dynamicCoordinates, actualSize, frameDelay, coordinates, buffer, framesCallback) {
    let actualAspectRatio = actualSize.width / actualSize.height;
    let expectedHeight = actualSize.width / expectedAspectRatio;
    let actualHeightMultiplier = actualSize.height / expectedHeight;
    if (actualHeightMultiplier >= 2) {
        // coordinates = [0, 0, actualSize.width, expectedHeight];
        framesCallback(actualHeightMultiplier);
        let promises = [];
        let animatedBuffer = makeAnimatedImage(name, type, actualSize, expectedHeight, actualHeightMultiplier, frameDelay, buffer, firstFrame => {
            // promises.push(uploadTransformImage(name, type, transform, transformation, dynamicCoordinates, actualSize, animatedBuffer, "animated", {frameCount:actualHeightMultiplier,frameDelay:frameDelay}));
        });
        let meta = {frameCount: actualHeightMultiplier, frameDelay: frameDelay, type: type,animated:true};
        uploadImage(name, type, animatedBuffer, "animated", meta);
        for (let transform in coordinates) {
            meta.transform = transform;
            let transformation = coordinates[transform];
            promises.push(uploadTransformImage(name, type, transform, transformation, dynamicCoordinates, {width: actualSize.width, height: expectedHeight}, animatedBuffer, "animated", meta));
        }
        return Promise.all(promises);
    } else {
        return handleStillCape(name, type, expectedAspectRatio, coordinates, dynamicCoordinates, actualSize, buffer);
    }
}

function makeAnimatedImage(name, type, actualSize, expectedHeight, frameCount, frameDelay, buffer, firstFrameCallback) {
    const sourceImage = new Image();
    sourceImage.src = buffer;

    const encoder = new GIFEncoder(actualSize.width, expectedHeight);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(frameDelay);

    const canvas = createCanvas(actualSize.width, expectedHeight);
    const context = canvas.getContext("2d");
    for (let i = 0; i < frameCount; i++) {
        context.drawImage(sourceImage, 0, i * expectedHeight, actualSize.width, expectedHeight, 0, 0, actualSize.width, expectedHeight);
        if (firstFrameCallback) {
            firstFrameCallback(canvas.toBuffer());
            firstFrameCallback = null;
        }
        encoder.addFrame(context);
    }
    encoder.finish();
    return encoder.out.getData();
    // return uploadTransformImage(name, type, "animated", coordinates, true, {width: actualSize.width, height: expectedHeight}, data, "animated", {frameCount:frameCount,frameDelay:frameDelay});
}

function formatMeta(meta) {
    let formattedMetaArr = [];
    for (let m in meta) {
        formattedMetaArr.push(m + "=" + meta[m]);
    }
    return formattedMetaArr.join("|");
}

function uploadTransformImage(name, type, transform, transformation, dynamic, size, buffer, suffix, meta) {
    if (typeof transformation === "function") {
        transformation = transformation(size);
    }
    return new Promise(resolve => {
        let options = {
            upload_preset: config.cloudinary.preset,
            public_id: name + "_" + transform,
            tags: ["cape", type, transform]
        };
        if (suffix) {
            options.public_id += "_" + suffix;
            options.tags.push(suffix);
        }
        if (meta) {
            options.context = formatMeta(meta);
        }
        if (!dynamic) {
            // use cloudinary preset
            options.transformation = "cape_" + transform + "_" + type;
        } else {
            // calculate based on dimensions
            options.transformation = {
                gravity: "north_west",
                x: Math.max(0, Math.round(size.width * transformation[0])),
                y: Math.max(0, Math.round(size.height * transformation[1])),
                width: Math.min(size.width, Math.round(size.width * transformation[2])),
                height: Math.min(size.height, Math.round(size.height * transformation[3])),
                crop: "crop"
            };
        }
        cloudinary.uploader.upload_stream(options, function (err, result) {
            if (err) {
                console.warn("cloudinary upload failed");
                console.warn(err);
                resolve(null);
                return;
            }
            resolve(result);
        }).end(buffer);
    });
}

function uploadImage(name, type, buffer, suffix, meta) {
    return new Promise(resolve => {
        let options = {
            upload_preset: config.cloudinary.preset,
            public_id: name,
            tags: ["cape", type]
        };
        if (suffix) {
            options.public_id += "_" + suffix;
            options.tags.push(suffix);
        }
        if (meta) {
            options.context = formatMeta(meta);
        }
        cloudinary.uploader.upload_stream(options, function (err, result) {
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

function imageUrl(name, options) {
    return cloudinary.url("capes/" + name, options);
}

module.exports = {
    nameFromUuid,
    uuidFromName,
    nameAndUuid,
    bufferHash,
    bufferDimensions,
    bufferFileExtension,
    capeHash,
    uploadImage,
    uploadTransformImage,
    handleAnimatedCape,
    handleStillCape,
    imageUrl,
    addUuidDashes
}
