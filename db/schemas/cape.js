const mongoose = require('mongoose')
    , Schema = mongoose.Schema;
const capeSchema = new Schema({
    hash: {
        type: String,
        index: true,
        unique: true
    },
    player: {
        type: String,
        index: true,
        minLength: 32,
        maxLength: 32
    },
    playerName: {
        type: String,
        minLength: 2,
        maxLength: 16
    },
    type: {
        type: String,
        index: true,
        enum: ["optifine", "minecraftcapes"]
    },
    time: {
        type: Number,
        index: true
    },
    imageHash: {
        type: String,
        index: true
    },
    width: Number,
    height: Number,
    image: Buffer
})
module.exports.Cape = mongoose.model("Cape", capeSchema);
