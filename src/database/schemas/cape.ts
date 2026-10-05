import { model, Schema } from "mongoose";
import { ICape, ICapeDocument, ICapeModel } from "../../typings/ICapeDocument";
import { CapeType } from "../../typings/CapeType";
import { Maybe } from "../../util";


export const CapeSchema: Schema<ICapeDocument, ICapeModel> = new Schema({
    hash: {
        type: String,
        index: true,
        unique: true
    },
    player: {
        type: String,
        minLength: 32,
        maxLength: 32
    },
    lowerPlayerName: {
        type: String,
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
        enum: Object.values(CapeType)
    },
    time: {
        type: Number,
        index: true
    },
    firstTime: {
        type: Number
    },
    views: {
        type: Number
    },
    animated: {
        type: Boolean
    },
    animationFrames: {
        type: Number
    },
    frameDelay: {
        type: Number
    },
    extension: String,
    imageHash: {
        type: String,
        index: true
    },
    width: Number,
    height: Number,
    cdn: String,
    extraData: Schema.Types.Mixed
});

// player/lowerPlayerName + type + time serve the latest-cape and history lookups without an in-memory sort,
// type + imageHash lets the stats count capes per type from the index alone
CapeSchema.index({ player: 1, type: 1, time: -1 });
CapeSchema.index({ lowerPlayerName: 1, type: 1, time: -1 });
CapeSchema.index({ type: 1, imageHash: 1 });


CapeSchema.statics.findByHash = function (hash: string): Promise<Maybe<ICape>> {
    return Cape.findOne({ hash: hash }).lean<ICape>().exec().then(cape => cape || undefined);
}

export const Cape: ICapeModel = model<ICapeDocument, ICapeModel>("Cape", CapeSchema);
