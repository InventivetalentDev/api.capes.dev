// https://stackoverflow.com/a/60323233/6257838
export class CapeError extends Error {
    constructor(public code: string, public msg?: string, public httpCode?: number) {
        super(msg ? `[${ code }] ${ msg }` : code);
        Object.setPrototypeOf(this, CapeError.prototype);
    }

    get name(): string {
        return 'CapeError';
    }
}

export enum CapeErrorCode {
    INVALID_PLAYER= "invalid_player"
}
