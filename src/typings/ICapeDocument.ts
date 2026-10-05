import { Document, Model } from "mongoose";
import { CapeType } from "./CapeType";
import { Maybe } from "../util";

/**
 * Plain cape fields, as returned by lean queries
 */
export interface ICape {
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

export interface ICapeDocument extends Document, ICape {
}

export interface ICapeModel extends Model<ICapeDocument> {
    findByHash(hash: string): Promise<Maybe<ICape>>;
}
