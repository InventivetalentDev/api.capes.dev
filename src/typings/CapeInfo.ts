import { CapeType } from "./CapeType";

export interface ImageUrls {
    base: { [s: string]: string };
    still: { [s: string]: string };
    animated: { [s: string]: string; };
}

export interface CapeInfo {
    hash: string;

    player: string;
    playerName: string;

    type: CapeType;
    time: number;

    width: number;
    fullWidth: number;
    height: number;
    fullHeight: number;

    extension: string;

    animated: boolean;
    animationFrames?: number;
    stillImageUrl?: string;
    animatedImageUrl?: string;

    exists: boolean;
    changed?: boolean;
    imageHash: string | null;

    capeUrl: string | null;
    imageUrl: string | null;
    imageUrls: ImageUrls | any;

    msg?: string;
}
