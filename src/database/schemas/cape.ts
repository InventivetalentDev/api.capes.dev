import { model, Schema } from "mongoose";
import { ICapeDocument, ICapeModel } from "../../typings/ICapeDocument";
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
        enum: Object.values(CapeType)
    },
    time: {
        type: Number,
        index: true
    },
    firstTime: {
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
    height: Number
});


CapeSchema.statics.findByHash = function (hash: string): Promise<ICapeDocument | null> {
    return Cape.findOne({ hash: hash }).exec();
}

export const Cape: ICapeModel = model<ICapeDocument, ICapeModel>("Cape", CapeSchema);
