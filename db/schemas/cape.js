const mongoose = require('mongoose')
    , Schema = mongoose.Schema;
const types = require("../../types");
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
    lowerPlayerName: {
        type: String,
        index: true,
        minLength: 2,
        maxLength: 16
    },
    playerName: {
        type: String,
        minLength: 2,
        maxLength: 16
    },
    type: {
        type: String,
        index: true,
        enum: types
    },
    time: {
        type: Number,
        index: true
    },
    animated: {
        type: Boolean
    },
    animationFrames: {
        type: Number
    },
    extension: String,
    imageHash: {
        type: String,
        index: true
    },
    width: Number,
    height: Number
})
module.exports.Cape = mongoose.model("Cape", capeSchema);
