export interface ProfileResponse {
    id: string;
    name: string;
    properties: ProfileProperty[];
}

export interface ProfileProperty {
    name: string;
    value: string;
    signature?: string;
}

export interface TextureInfo {
    textures: {
        CAPE?: {
            url: string;
        }
    }
}
