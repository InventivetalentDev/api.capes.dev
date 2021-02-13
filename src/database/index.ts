import * as mongoose from "mongoose";
import { Mongoose } from "mongoose";
import { CapesConfig } from "../typings/Configs";
import tunnel = require("tunnel-ssh");

export default function connectToMongo(config: CapesConfig): Promise<Mongoose> {
    return new Promise<Mongoose>((resolve, reject) => {
        if (config.mongo.useTunnel) {
            console.log("Establishing SSH Tunnel to " + config.mongo.tunnel.host + "...");
            tunnel(config.mongo.tunnel, (err, server) => {
                if (err) {
                    console.error(err);
                    return;
                }
                connectMongo(config).then(resolve).catch(reject);
            })
        } else {
            connectMongo(config).then(resolve).catch(reject);
        }
    })
};

async function connectMongo(config: CapesConfig) {
    // Connect to DB
    mongoose.set('useNewUrlParser', true);
    mongoose.set('useFindAndModify', false);
    let m: Mongoose;
    if (config.mongo.url) {
        console.log("Connecting to mongodb...");
        m = await mongoose.connect(config.mongo.url);
    } else {
        console.log("Connecting to mongodb://" + ((config.mongo.user || "admin") + ":*****" + "@" + (config.mongo.address || "localhost") + ":" + (config.mongo.port || 27017) + "/" + (config.mongo.database || "database")));
        m = await mongoose.connect("mongodb://" + ((config.mongo.user || "admin") + ":" + (config.mongo.pass || "admin") + "@" + (config.mongo.address || "localhost") + ":" + (config.mongo.port || 27017) + "/" + (config.mongo.database || "database")));
    }
    console.info("MongoDB connected!");
    return m;
}
