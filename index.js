const config = require("./config");

const util = require("./util");
const express = require("express");
const app = express();
const http = require("http");
const server = http.Server(app);
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const fs = require("fs");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;

console.log("\n" +
    " === STARTING === \n" +
    "\n")

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE, PUT");
        res.header("Access-Control-Allow-Headers", "X-Requested-With, Accept, Content-Type, Origin");
        res.header("Access-Control-Request-Headers", "X-Requested-With, Accept, Content-Type, Origin");
        return res.sendStatus(200);
    } else {
        return next();
    }
});
app.use(bodyParser.json({extended: true}));
app.use(function (req, res, next) {
    req.realAddress = req.header("x-real-ip") || req.realAddress;
    next();
});

app.use("/.well-known", express.static(".well-known"));

// Database
require("./db/db")(mongoose, config);
const Cape = require("./db/schemas/cape").Cape;

// CDN
cloudinary.config(config.cloudinary);

app.get("/", function (req, res) {
    res.json({msg: "Hi!"});
});

const SUPPORTED_TYPES = require("./types");
const HAS_NO_CAPE = "hasN0Cape";

app.get("/load/:player/:type?", function (req, res) {
    let player = req.params.player;
    let type = req.params.type || "all";
    if (player.length < 2 || player.length > 36) {
        res.status(400).json({error: "invalid player"});
        return;
    }
    player = player.replace(/-/g, "").toLowerCase();

    if (type === "all") {
        let promises = [];
        for (let ty of SUPPORTED_TYPES) {
            promises.push(loadOrGetCape(ty, player));
        }
        Promise.all(promises).then(capes => {
            if (!capes) {
                res.status(404).json({error: "not found"});
            } else {
                let obj = {};
                for (let cap of capes) {
                    obj[cap.type] = cap;
                }
                res.json(obj);
            }
        }).catch(err => {
            console.warn(err);
            res.status(err.code).json(err);
        })
    } else {
        if (SUPPORTED_TYPES.indexOf(type) === -1) {
            res.status(400).json({error: type + " is not supported. (" + SUPPORTED_TYPES + ")"});
            return;
        }

        loadOrGetCape(type, player).then(cape => {
            if (!cape) {
                res.status(404).json({error: "not found"});
            } else {
                res.json(cape);
            }
        }).catch(err => {
            console.warn(err);
            res.status(err.code).json(err);
        })
    }
});

function loadOrGetCape(type, player) {
    return new Promise((resolve, reject) => {
        let capeQuery = {
            type: type
        };
        if (player.length < 20) { // name
            capeQuery.lowerPlayerName = player.toLowerCase();
        } else { // uuid
            capeQuery.player = player.toLowerCase();
        }
        Cape.findOne(capeQuery).sort({time: -1}).exec(function (err, existingCape) {
            if (err) {
                console.error(err);
                reject({code:500,error:"database error"});
                return;
            }
            if (existingCape) {
                if (Date.now() - existingCape.time < 600) { // Don't bother with capes already fetched within the last 10mins
                    resolve(makeCapeInfo(existingCape))
                    return;
                }
            }

            util.nameAndUuid(player).then(nameAndUuid => {
                let name = nameAndUuid[0];
                let uuid = nameAndUuid[1];
                if (!name || !uuid) {
                    reject({code:404,error:"player not found"});
                    return;
                }

                console.info("Loading " + type + " cape for " + name + " (" + uuid + ")...");

                util.fetchCape(type, uuid, name).then(capeBuffer => {
                    let time = Math.floor(Date.now() / 1000);
                    let imageHash = capeBuffer ? util.bufferHash(capeBuffer) : HAS_NO_CAPE;
                    if (existingCape && imageHash === existingCape.imageHash) {
                        console.info("Updating time of existing " + type + " cape for " + name + " (" + existingCape.hash + ")");
                        existingCape.time = time;
                        existingCape.save(function (err, cape) {
                            if (err) {
                                console.warn("Failed to save cape");
                                console.error(err);
                                return;
                            }
                            resolve(makeCapeInfo(cape, true, false));
                        })
                    } else {
                        let capeHash = util.capeHash(imageHash, player, type, time);
                        let capeSize = capeBuffer ? util.bufferDimensions(capeBuffer) : {width: 0, height: 0};
                        util.bufferFileExtension(capeBuffer).then(extension => {
                            console.info("Saving new " + type + " cape for " + name + " (" + capeHash + " " + capeSize.width + "x" + capeSize.height + ")");
                            if (capeBuffer) {
                                console.info("Uploading " + imageHash + " to cloudinary...");
                                util.uploadImage(imageHash, type, capeBuffer);
                            }
                            let cape = new Cape({
                                hash: capeHash,
                                player: uuid.toLowerCase(),
                                playerName: name,
                                lowerPlayerName: name.toLowerCase(),
                                type: type,
                                time: time,
                                extension: extension,
                                imageHash: imageHash,
                                width: capeSize.width || 0,
                                height: capeSize.height || 0
                            });
                            cape.save(function (err, cape) {
                                if (err) {
                                    console.warn("Failed to save cape");
                                    console.error(err);
                                    return;
                                }
                                resolve(makeCapeInfo(cape, true, true));
                            })
                        })
                    }
                });
            }).catch(err => {
                console.warn(err);
                reject({code:500,error:"failed to get player name/uuid"});
            })
        });
    })
}


app.get("/history/:player/:type?", function (req, res) {
    let player = req.params.player;
    let type = req.params.type || "all";
    if (player.length < 2 || player.length > 36) {
        res.status(400).json({error: "invalid player"});
        return;
    }
    player = player.replace(/-/g, "").toLowerCase();

    if (type !== "all" && SUPPORTED_TYPES.indexOf(type) === -1) {
        res.status(400).json({error: type + " is not supported. (" + SUPPORTED_TYPES + ")"})
        return;
    }

    let capeQuery = {};
    if (type !== "all") {
        capeQuery.type = type;
    }
    if (player.length < 20) { // name
        capeQuery.lowerPlayerName = player.toLowerCase();
    } else { // uuid
        capeQuery.player = player.toLowerCase();
    }
    Cape.find(capeQuery).sort({time: -1}).exec(function (err, capes) {
        if (err) {
            console.error(err);
            res.status(500).json({error: "database error"});
            return;
        }

        let history = [];
        for (let cape of capes) {
            if (cape.imageHash !== HAS_NO_CAPE) {
                history.push(makeCapeInfo(cape, false))
            }
        }
        res.json({
            type: type,
            player: player,
            history: history
        })
    });
});


app.get("/get/:hash", function (req, res) {
    let hash = req.params.hash;

    Cape.findOne({hash: hash}, function (err, cape) {
        if (err) {
            console.error(err);
            res.status(500).json({error: "database error"});
            return;
        }
        if (!cape) {
            res.status(404).json({error: "not found"});
        } else {
            sendCapeInfo(req, res, cape);
        }
    })
})

app.get("/img/:hash", function (req, res) {
    let hash = req.params.hash;
    hash = hash.split(".")[0]; // Remove potential file extensions

    Cape.findOne({imageHash: hash}, "hash imageHash extension", function (err, cape) {
        if (err) {
            console.error(err);
            res.status(500).json({error: "database error"});
            return;
        }
        if (!cape) {
            res.status(404).json({error: "not found"});
        } else {
            let url = "https://res.cloudinary.com/" + config.cloudinary.cloud_name + "/image/upload/capes/" + cape.imageHash + "." + cape.extension;
            res.header("X-Image-Location", url);
            axios({
                method: "get",
                url: url,
                responseType: "stream"
            }).then(resp => {
                resp.data.pipe(res);
            }).catch(err => {
                if (err.response.status === 404) {
                    res.status(404).json({error: "cape image not found"});
                } else {
                    console.warn(err);
                    res.status(500).json({error: "failed to load cape image"});
                }
            })
        }
    })
})

function makeCapeInfo(cape, message, changed) {
    let hasNoCape = cape.imageHash === HAS_NO_CAPE;
    let json = {
        hash: cape.hash,
        player: cape.player,
        playerName: cape.playerName,
        type: cape.type,
        time: cape.time,
        width: cape.width,
        height: cape.height,
        extension: cape.extension,
        imageHash: hasNoCape ? null : cape.imageHash,
        capeUrl: hasNoCape ? null : ("https://api.capes.dev/get/" + cape.hash),
        imageUrl: hasNoCape ? null : ("https://api.capes.dev/img/" + cape.imageHash)
    };
    if (typeof changed !== "undefined") {
        json.changed = changed;
    }
    if (message) {
        json.msg = hasNoCape ? "Player has no cape" : "Cape found"
    }
    return json;
}

function sendCapeInfo(req, res, cape, changed) {
    res.json(makeCapeInfo(cape, true, changed));
}


server.listen(config.port, function () {
    console.log(' ==> listening on *:' + config.port + "\n");
});
