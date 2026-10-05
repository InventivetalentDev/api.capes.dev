import * as mongoose from "mongoose";
import { ConnectOptions, Mongoose } from "mongoose";
import { CapesConfig } from "../typings/Configs";

export default async function connectToMongo(config: CapesConfig): Promise<Mongoose> {
    // Connect to DB
    mongoose.set('useNewUrlParser', true);
    mongoose.set('useFindAndModify', false);
    mongoose.set('useCreateIndex', true);
    mongoose.set('useUnifiedTopology', true);
    const options: ConnectOptions = {
        poolSize: config.mongo.poolSize || 10
    };
    let m: Mongoose;
    if (config.mongo.url) {
        console.log("Connecting to mongodb...");
        m = await mongoose.connect(config.mongo.url, options);
    } else {
        console.log("Connecting to mongodb://" + ((config.mongo.user || "admin") + ":*****" + "@" + (config.mongo.address || "localhost") + ":" + (config.mongo.port || 27017) + "/" + (config.mongo.database || "database")));
        m = await mongoose.connect("mongodb://" + ((config.mongo.user || "admin") + ":" + (config.mongo.pass || "admin") + "@" + (config.mongo.address || "localhost") + ":" + (config.mongo.port || 27017) + "/" + (config.mongo.database || "database")), options);
    }
    console.info("MongoDB connected!");
    return m;
}
