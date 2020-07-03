const config = require("./config");

const util = require("./util");
const express = require("express");
const app = express();
const http = require("http");
const server = http.Server(app);
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const fs = require("fs");

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

app.get("/", function (req, res) {
    res.json({msg: "Hi!"});
});

const SUPPORTED_TYPES = ["optifine", "minecraftcapes"];
const HAS_NO_CAPE = "hasN0Cape";

app.get("/load/:player/:type?", function (req, res) {
    let player = req.params.player;
    let type = req.params.type || "optifine";
    if (player.length < 2 || player.length > 36) {
        res.status(400).json({error: "invalid player"});
        return;
    }
    player = player.replace(/-/g, "").toLowerCase();

    if (SUPPORTED_TYPES.indexOf(type) === -1) {
        res.status(400).json({error: type + " is not supported. (" + SUPPORTED_TYPES + ")"})
        return;
    }

    let capeQuery = {
        type: type
    };
    if (player.length < 20) { // name
        capeQuery.playerName = player;
    } else { // uuid
        capeQuery.player = player;
    }
    Cape.findOne(capeQuery).sort({time: -1}).exec(function (err, existingCape) {
        if (err) {
            console.error(err);
            res.status(500).json({error: "database error"});
            return;
        }
        if (existingCape) {
            if (Date.now() - existingCape.time < 600) { // Don't bother with capes already fetched within the last 10mins
                sendCapeInfo(req, res, existingCape);
                return;
            }
        }

        util.nameAndUuid(player).then(nameAndUuid => {
            let name = nameAndUuid[0];
            let uuid = nameAndUuid[1];

            console.info("Loading " + type + " cape for " + name + " (" + uuid + ")...");

            util.fetchOptifineCape(name).then(capeBuffer => {
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
                        sendCapeInfo(req, res, cape);
                    })
                } else {
                    let capeHash = util.capeHash(imageHash, player, type, time);
                    let capeSize = capeBuffer ? util.bufferDimensions(capeBuffer) : {width:0,height:0};

                    console.info("Saving new " + type + " cape for " + name + " (" + capeHash + " "+capeSize.width+"x"+capeSize.height+")");
                    let cape = new Cape({
                        hash: capeHash,
                        player: uuid,
                        playerName: name,
                        type: type,
                        time: time,
                        imageHash: imageHash,
                        width: capeSize.width || 0,
                        height: capeSize.height || 0,
                        image: capeBuffer
                    });
                    cape.save(function (err, cape) {
                        if (err) {
                            console.warn("Failed to save cape");
                            console.error(err);
                            return;
                        }
                        sendCapeInfo(req, res, cape);
                    })
                }
            });
        }).catch(err => {
            console.warn(err);
            res.status(500).json({error: "failed to get username"});
        })
    });
});

app.get("/history/:player/:type?", function (req, res) {
    let player = req.params.player;
    let type = req.params.type || "optifine";
    if (player.length < 2 || player.length > 36) {
        res.status(400).json({error: "invalid player"});
        return;
    }
    player = player.replace(/-/g, "").toLowerCase();

    if (SUPPORTED_TYPES.indexOf(type) === -1) {
        res.status(400).json({error: type + " is not supported. (" + SUPPORTED_TYPES + ")"})
        return;
    }

    let capeQuery = {
        type: type
    };
    if (player.length < 20) { // name
        capeQuery.playerName = player;
    } else { // uuid
        capeQuery.player = player;
    }
    Cape.find(capeQuery).sort({time: -1}).exec(function (err, capes) {
        if (err) {
            console.error(err);
            res.status(500).json({error: "database error"});
            return;
        }

        let history = [];
        for (let cape of capes) {
            if(cape.imageHash !== HAS_NO_CAPE) {
                history.push({
                    hash: cape.hash,
                    playerName: cape.playerName,
                    time: cape.time,
                    width: cape.width,
                    height: cape.height,
                    imageHash: cape.imageHash,
                    capeUrl: "https://api.capes.dev/get/" + cape.hash,
                    imageUrl: "https://api.capes.dev/img/" + cape.hash
                })
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

    Cape.findOne({hash: hash}, "image", function (err, cape) {
        if (err) {
            console.error(err);
            res.status(500).json({error: "database error"});
            return;
        }
        if (!cape) {
            res.status(404).json({error: "not found"});
        } else {
            res.header("Content-Type", "image/png");
            res.send(cape.image);
        }
    })
})

function sendCapeInfo(req, res, cape) {
    res.json({
        msg: cape.image ? "Cape found" : "Player has no cape",
        hash: cape.hash,
        player: cape.player,
        playerName: cape.playerName,
        type: cape.type,
        time: cape.time,
        width: cape.width,
        height: cape.height,
        imageHash: cape.imageHash === HAS_NO_CAPE ? null : cape.imageHash,
        capeUrl: cape.image ? ("https://api.capes.dev/get/" + cape.hash) : null,
        imageUrl: cape.image ? ("https://api.capes.dev/img/" + cape.hash) : null
    })
}


server.listen(config.port, function () {
    console.log(' ==> listening on *:' + config.port + "\n");
});
