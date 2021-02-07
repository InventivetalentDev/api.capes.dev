export interface Size {
    width: number;
    height: number;
}

export type Coordinates = number[];

export type Transforms = { [s: string]: Coordinates };
