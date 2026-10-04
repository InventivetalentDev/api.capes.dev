import * as mongoose from "mongoose";
import { getConfig } from "../typings/Configs";
import connectToMongo from "../database";
import { Cape, CAPE_COMPOUND_INDEXES } from "../database/schemas/cape";

/**
 * Builds the compound cape indexes and drops the single-field indexes they replace.
 * Run this before deploying, so the app doesn't build the new indexes on startup:
 *   npm run build && npm run migrate-indexes
 */

// prefixes of the compound indexes, so every query they served is still covered
const REPLACED_INDEXES = ["player_1", "lowerPlayerName_1", "type_1"];

async function migrate() {
    // build the indexes here, with progress output, instead of in the background on connect
    mongoose.set("autoIndex", false);
    await connectToMongo(getConfig());
    const collection = Cape.collection;

    for (const index of CAPE_COMPOUND_INDEXES) {
        console.log(`Building index ${ JSON.stringify(index) }...`);
        const start = Date.now();
        const name = await collection.createIndex(index);
        console.log(`  ${ name } ready after ${ (Date.now() - start) / 1000 }s`);
    }

    const existing = (await collection.indexes()).map((index: any) => index.name);
    for (const name of REPLACED_INDEXES) {
        if (!existing.includes(name)) {
            console.log(`${ name } already dropped`);
            continue;
        }
        console.log(`Dropping index ${ name }`);
        await collection.dropIndex(name);
    }

    // time_1 isn't used by any query in this app - check whether anything else uses it before dropping it
    console.log("Index usage since the last restart of mongod:");
    const usage = await collection.aggregate([{ $indexStats: {} }]).toArray();
    for (const index of usage) {
        console.log(`  ${ index.name }: ${ index.accesses.ops } ops since ${ index.accesses.since }`);
    }
}

migrate()
    .then(() => process.exit(0))
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
