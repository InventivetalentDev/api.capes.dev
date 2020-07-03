const config = {};

config.port = 3026;

config.mongo = {
    useTunnel: false,
    tunnel: {
        username: "mongo",
        host: "1.2.3.4",
        privateKey: require("fs").readFileSync("./id_rsa"),
        port: 22,
        dstPort: 27017
    },
    user: "admin",
    pass: "admin",
    address: "localhost",
    port: 27017,
    database: "capes"
};

module.exports = config;
