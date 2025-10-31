import { Document, Model } from "mongoose";
import { CapeType } from "./CapeType";
import { Maybe } from "../util";

export interface ICapeDocument extends Document {
    hash: string;

    player: string;
    lowerPlayerName: string;
    playerName: string;

    type: CapeType;
    extension: string;
    imageHash: string;

    time: number;
    firstTime: number;

    views: number;

    animated: boolean;
    animationFrames?: number;
    frameDelay?: number;

    width: number;
    height: number;

    cdn?: string;

    extraData?: Record<string, any>;
}

export interface ICapeModel extends Model<ICapeDocument> {
    findByHash(hash: string): Promise<Maybe<ICapeDocument>>;
}
