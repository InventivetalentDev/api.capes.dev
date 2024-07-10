import { ICapeDocument } from "./typings/ICapeDocument";
import { CapeInfo, ImageUrls } from "./typings/CapeInfo";
import { formatMeta, HAS_NO_CAPE, Maybe } from "./util";
import { CapeType } from "./typings/CapeType";
import { CapeLoader } from "./loaders/CapeLoader";
import * as Sentry from "@sentry/node";
import { User } from "./typings/User";
import { Cape } from "./database/schemas/cape";
import { Caching } from "./Caching";
import { CapeError, CapeErrorCode } from "./typings/CapeError";
import { debug, info, warn } from "./util/colors";
import * as hasha from "hasha";
import * as crypto from "crypto";
import { LoadedCapeInfo } from "./typings/LoadedCapeInfo";
import * as bufferImageSize from "buffer-image-size";
import { UploadApiErrorResponse, UploadApiResponse, v2 as cloudinary } from "cloudinary";
import { UploadApiOptions } from "cloudinary";
import { getConfig } from "./typings/Configs";
import { Coordinates, Size, Transforms } from "./typings";
import { CanvasRenderingContext2D, createCanvas, Image } from "canvas";
import * as GIFEncoder from "gifencoder"
import exp = require("constants");
import { Blob } from "buffer";
import { Buffer } from "node:buffer";
import * as FormData from "form-data";
import { Requests } from "./Requests";

const config = getConfig();

export const SUPPORTED_TYPES: string[] = [];

export const LOADERS: { [t: string]: CapeLoader } = {};
Object.values(CapeType).forEach(async (t) => {
    try {
        let loader = await import(`${ __dirname }/loaders/${ t }`);
        LOADERS[t] = new loader.default() as CapeLoader;
        SUPPORTED_TYPES.push(t as CapeType);
    } catch (e) {
        console.warn(warn(`Failed to init cape loader ${ t }`));
        console.warn(e);
        Sentry.captureException(e);
    }
})

export class CapeHandler {

    static async getOrLoadCape(type: CapeType, player: string): Promise<Maybe<LoadedCapeInfo>> {
        let capeQuery: any = {
            type: type
        };
        if (player.length < 20) { // name
            capeQuery.lowerPlayerName = player.toLowerCase();
        } else { // uuid
            capeQuery.player = player.toLowerCase();
        }
        const existingCape = await Cape.findOne(capeQuery).sort({time: -1}).exec();
        if (existingCape) {
            if (Date.now() - existingCape.time < 600) { // Don't bother with capes already fetched within the last 10mins
                return {
                    cape: Caching.cacheCape(existingCape),
                    changed: false
                };
            }
        }

        const user = await Caching.getUser(player);
        if (!user || !user.valid || !user.uuid || !user.name) {
            throw new CapeError(CapeErrorCode.INVALID_PLAYER, "player not found", 404);
        }
        if (!(type in LOADERS)) {
            throw new Error("invalid cape type");
        }
        const loader = LOADERS[type];

        console.log(info(`Loading ${ type } cape for ${ user.name } (${ user.uuid })`));

        const loadedCape = await loader.fetchCape(user.name, user.uuid);
        const time = Math.floor(Date.now() / 1000);
        const imageHash = loadedCape ? hasha(loadedCape) : HAS_NO_CAPE;
        if (existingCape && imageHash === existingCape.imageHash) {
            console.log(debug(`Updating time of existing ${ type } cape for ${ user.uuid } (${ existingCape.hash })`));
            if (!existingCape.firstTime) {
                existingCape.firstTime = existingCape.time;
            }
            existingCape.time = time;
            if (!existingCape.views) {
                existingCape.views = 1;
            }
            existingCape.views++;
            return {
                cape: Caching.cacheCape(await existingCape.save()),
                changed: false
            };
        } else {
            const capeHash = this.capeHash(imageHash, user.uuid, type, time);
            const capeSizeAndType = loadedCape ? bufferImageSize(loadedCape) : {width: 0, height: 0, type: ""};

            console.log(info(`Saving new ${ type } cape for ${ user.name } (${ capeHash } ${ capeSizeAndType.width }x${ capeSizeAndType.height })`));
            let animationFrames = -1;
            const frameDelay = await loader.frameDelay(user.uuid, user.name);
            if (loadedCape) {
                console.log(debug(`Uploading ${ imageHash } to cloudinary...`));
                await this.uploadImage(imageHash, type, loadedCape, undefined, {type: type});
                const isAnimated = loader.supportsAnimation && await loader.isAnimated(capeSizeAndType.width, capeSizeAndType.height, user.uuid, user.name);
                const coordinates = await loader.coordinates(isAnimated, user.uuid, user.name);
                const aspectRatio = await loader.aspectRatio(isAnimated, user.uuid, user.name);
                const dynamicCoordinates = loader.dynamicCoordinates;
                if (isAnimated) {
                    console.log(debug(`Type supports animation, handling animated cape`));
                    await this.handleAnimatedCape(imageHash, type, aspectRatio, dynamicCoordinates, capeSizeAndType, frameDelay, coordinates, loadedCape, frames => {
                        animationFrames = frames;
                    })
                } else {
                    console.log(debug(`Handling still cape`));
                    await this.handleStillCape(imageHash, type, aspectRatio, coordinates, dynamicCoordinates, capeSizeAndType, loadedCape);
                }
            }
            const cape = new Cape(<ICapeDocument>{
                hash: capeHash,
                player: user.uuid.toLowerCase(),
                playerName: user.name,
                lowerPlayerName: user.name.toLowerCase(),
                type: type,
                time: time,
                firstTime: time,
                extension: capeSizeAndType.type,
                imageHash: imageHash,
                width: capeSizeAndType.width || 0,
                height: capeSizeAndType.height || 0,
                cdn: "cloudflare"
            });
            if (animationFrames > 0) {
                cape.animationFrames = animationFrames;
                cape.frameDelay = frameDelay;
                cape.animated = true;
            }
            return {
                cape: Caching.cacheCape(await cape.save()),
                changed: true
            }
        }
    }

    static async handleStillCape(name: string, type: CapeType, aspectRatio: number, transforms: Transforms, dynamicCoordinates: boolean, capeSize: Size, buffer: Buffer): Promise<void> {
        for (let transform in transforms) {
            let coordinates = transforms[transform];
            await this.uploadTransformImage(name, type, transform, coordinates, dynamicCoordinates, capeSize, buffer, undefined, {
                type: type,
                transform: transform
            });
        }
    }

    static async handleAnimatedCape(name: string, type: CapeType, expectedAspectRatio: number, dynamicCoordinates: boolean, actualSize: Size, frameDelay: number, transforms: Transforms, buffer: Buffer, framesCallback?: (heightMultiplier: number) => void): Promise<void> {
        let actualAspectRatio = actualSize.width / actualSize.height;
        let expectedHeight = actualSize.width / expectedAspectRatio;
        let actualHeightMultiplier = actualSize.height / expectedHeight;
        if (actualHeightMultiplier >= 2) {
            if (framesCallback) {
                framesCallback(actualHeightMultiplier);
            }
            const animatedBuffer = await this.makeAnimatedImage(name, type, actualSize, expectedHeight, actualHeightMultiplier, frameDelay, buffer, firstFrame => {
            });
            const meta: any = {
                frameCount: actualHeightMultiplier,
                frameDelay: frameDelay,
                type: type,
                animated: true
            };
            await this.uploadImage(name, type, animatedBuffer, "animated", meta);

            for (let transform in transforms) {
                meta.transform = transform;
                let coordinates = transforms[transform];
                await this.uploadTransformImage(name, type, transform, coordinates, dynamicCoordinates, {
                    width: actualSize.width,
                    height: expectedHeight
                }, animatedBuffer, "animated", "buffer");
            }
        } else {
            return this.handleStillCape(name, type, expectedAspectRatio, transforms, dynamicCoordinates, actualSize, buffer);
        }
    }

    static async makeAnimatedImage(name: string, type: CapeType, actualSize: Size, expectedHeight: number, frameCount: number, frameDelay: number, buffer: Buffer, firstFrameCallback?: (buffer: Buffer) => void): Promise<Buffer> {
        const sourceImage = new Image();
        sourceImage.src = buffer;

        const encoder: GIFEncoder & { out: any } = new GIFEncoder(actualSize.width, expectedHeight) as GIFEncoder & {
            out: any
        };

        const out: Uint8Array[] = [];
        const readStream = encoder.createReadStream();
        const promise = new Promise<Buffer>(resolve => {
            readStream.on('data', chunk => out.push(chunk));
            readStream.on('end', () => {
                resolve(Buffer.concat(out));
            });
        })

        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(frameDelay);

        const canvas = createCanvas(actualSize.width, expectedHeight);
        const context = canvas.getContext("2d");
        for (let i = 0; i < frameCount; i++) {
            context.drawImage(sourceImage, 0, i * expectedHeight, actualSize.width, expectedHeight, 0, 0, actualSize.width, expectedHeight);
            if (firstFrameCallback) {
                firstFrameCallback(canvas.toBuffer());
                firstFrameCallback = undefined;
            }
            encoder.addFrame(context as any); //FIXME: seems like the encoder library is outdated
        }
        encoder.finish();

        return promise;
    }


    static async uploadTransformImage(name: string, type: string, transform: string, transformation: Coordinates | ((size: Size) => Coordinates), dynamic: boolean, size: Size, buffer: Buffer, suffix?: string, meta?: any): Promise<Maybe<UploadApiResponse>> {
        if (typeof transformation === "function") {
            transformation = transformation(size);
        }

        const options: UploadApiOptions = {
            upload_preset: config.cloudinary.preset,
            public_id: name + "_" + transform,
            tags: ["cape", type, transform]
        };
        if (suffix) {
            options.public_id += "_" + suffix;
            options.tags.push(suffix);
        }
        if (meta) {
            options.context = formatMeta(meta);
        }
        if (!dynamic) {
            // use cloudinary preset
            options.transformation = "cape_" + transform + "_" + type;
        } else {
            // calculate based on dimensions
            options.transformation = {
                gravity: "north_west",
                x: Math.max(0, Math.round(size.width * transformation[0])),
                y: Math.max(0, Math.round(size.height * transformation[1])),
                width: Math.min(size.width, Math.round(size.width * transformation[2])),
                height: Math.min(size.height, Math.round(size.height * transformation[3])),
                crop: "crop"
            }
        }
        return new Promise(resolve => {
            cloudinary.uploader.upload_stream(options, (err?: UploadApiErrorResponse, result?: UploadApiResponse) => {
                if (err) {
                    Sentry.captureException(err);
                    resolve(undefined);
                } else {
                    resolve(result);
                }
            }).end(buffer);
        })
    }


    static async uploadImage(name: string, type: string, buffer: Buffer, suffix?: string, meta?: any): Promise<Maybe<UploadApiResponse>> {
        const res = await this.uploadImageCloudinary(name, type, buffer, suffix, meta);
        try {
            await this.uploadImageCloudflare(name, type, buffer, suffix, meta)
        } catch (e) {
            console.log(e)
        }
        return res;
    }

    static async uploadImageCloudinary(name: string, type: string, buffer: Buffer, suffix?: string, meta?: any): Promise<Maybe<UploadApiResponse>> {
        const options: UploadApiOptions = {
            upload_preset: config.cloudinary.preset,
            public_id: name,
            tags: ["cape", type]
        };
        if (suffix) {
            options.public_id += "_" + suffix;
            options.tags.push(suffix);
        }
        if (meta) {
            options.context = formatMeta(meta);
        }
        return new Promise(resolve => {
            cloudinary.uploader.upload_stream(options, (err?: UploadApiErrorResponse, result?: UploadApiResponse) => {
                if (err) {
                    Sentry.captureException(err);
                    resolve(undefined);
                } else {
                    resolve(result);
                }
            }).end(buffer);
        })
    }

    static async uploadImageCloudflare(name: string, type: string, buffer: Buffer, suffix?: string, meta?: any): Promise<Maybe<any>> {
        const formData = new FormData();
        formData.append("file", buffer, name);

        let publicId = name;
        const metadata: any = {
            "cape": type
        };
        if (suffix) {
            publicId += "_" + suffix;
            metadata["suffix"] = suffix;
        }
        if (meta) {
            for (const key of Object.keys(meta)) {
                metadata[key] = meta[key];
            }
        }

        formData.append("id", `capes/${ publicId }`);
        formData.append("metadata", JSON.stringify(metadata));

        try {
            const res = await Requests.axiosInstance.request({
                method: "POST",
                url: `https://api.cloudflare.com/client/v4/accounts/${ config.cloudflare.accountId }/images/v1`,
                headers: {
                    "Authorization": "Bearer " + config.cloudflare.apiToken,
                    "Content-Type": `multipart/form-data; boundary=${ formData.getBoundary() }`,
                },
                data: formData
            });
            console.log(res.data);
            console.log(res.data.result);
            return res;
        } catch (e) {
            if (e.response) {
                console.log(e.response.data)
                console.log(e.response.errors);
            }
        }
        return null;//FIXME
    }

    static async findCapeImageUrl(imageHash: string, transform?: string, preferStill: boolean = false, preferAnimated: boolean = false): Promise<Maybe<string>> {
        const cape = await Cape.findOne({imageHash: imageHash}, "hash imageHash extension animated").exec();
        if (!cape) {
            return undefined;
        }

        let file = cape.imageHash;
        const options: any = {};
        if (transform) {
            file += "_" + transform;
        }
        if (cape.animated) {
            file += "_animated";
            if (preferStill) { // Reply with the first frame of the animation, cropped to regular dimensions
                options["page"] = 1; // first GIF frame
            } else if (preferAnimated) { // Reply with animation, cropped to regular dimensions
            }
            // Otherwise reply with the full size original cape image, including all the frames
        }
        return this.imageUrl(file, options);
    }

    static async findCloudflareCapeImageUrl(imageHash: string, transform?: string, preferStill: boolean = false, preferAnimated: boolean = false): Promise<Maybe<string>> {
        const cape = await Cape.findOne({imageHash: imageHash}, "hash imageHash type width height extension animated").exec();
        if (!cape) {
            return undefined;
        }

        let file = cape.imageHash;
        if (cape.animated) {
            file += "_animated";
        }

        let url = `https://imagedelivery.net/${ config.cloudflare.accountHash }/capes/${ file }`;

        let usePublic = true;
        if (transform) {
            // trim format: top;right;bottom;left
            const coordinates = await LOADERS[cape.type].coordinates();
            if (coordinates[transform]) {
                let [left, top, width, height] = coordinates[transform];

                top = Math.max(0, Math.round(cape.height * top));
                left = Math.max(0, Math.round(cape.width * left));
                width = Math.min(cape.width, Math.max(1, Math.round(cape.width * width)));
                height = Math.min(cape.height, Math.max(1, Math.round(cape.height * height)));

                const right = Math.max(0, cape.width - left - width);
                const bottom = Math.max(0, cape.height - top - height);

                url += `/trim=${ top };${ right };${ bottom };${ left }`;
                usePublic = false;
            }
        }
        if (cape.animated) {
            if (preferStill) { // Reply with the first frame of the animation, cropped to regular dimensions
                url += `,anim=false`
                usePublic = false;
            } else if (preferAnimated) { // Reply with animation, cropped to regular dimensions
            }
            // Otherwise reply with the full size original cape image, including all the frames
        }

        if (usePublic) {
            url += `/public`;
        }

        return url;
    }

    static imageUrl(name: string, options: any): string {
        return cloudinary.url("capes/" + name, options);
    }

    static capeHash(imageHash: string, uuid: string, type: CapeType, time: number) {
        let content = type + "_" + uuid + "_" + imageHash + "_" + time;
        return crypto.createHash("sha1").update(content).digest("hex");
    }


    static makeCapeInfo(cape: ICapeDocument, message: boolean = false, changed: boolean = false): CapeInfo | any {
        let hasNoCape = cape.imageHash === HAS_NO_CAPE;
        let json: CapeInfo | any = {
            hash: cape.hash,
            player: cape.player,
            playerName: cape.playerName,
            type: cape.type,
            time: cape.time,
            width: cape.width,
            fullWidth: cape.width,
            height: cape.animated ? Math.floor(cape.height / cape.animationFrames!) : cape.height,
            fullHeight: cape.height,
            extension: cape.extension,
            animated: cape.animated,
            exists: !hasNoCape,
            imageHash: hasNoCape ? null : cape.imageHash,
            capeUrl: hasNoCape ? null : ("https://api.capes.dev/get/" + cape.hash),
            imageUrl: hasNoCape ? null : ("https://api.capes.dev/img/" + cape.imageHash) // deprecated
        };
        if (!hasNoCape) {
            if (cape.animated) {
                json.animationFrames = cape.animationFrames;
                json.stillImageUrl = "https://api.capes.dev/img/" + cape.imageHash + "?still"; // deprecated
                json.animatedImageUrl = "https://api.capes.dev/img/" + cape.imageHash + "?animated"; // deprecated
            } else {
                // default to regular image for consistency
                json.stillImageUrl = "https://api.capes.dev/img/" + cape.imageHash; // deprecated
            }
            let imageUrls: ImageUrls = {
                base: {
                    full: json.imageUrl
                },
                still: {},
                animated: {}
            };
            let loader = LOADERS[cape.type];
            if (loader) {
                let coordinates = loader.coordinates();
                let baseUrl = "https://api.capes.dev/img/";
                imageUrls["still"]["full"] = baseUrl + cape.imageHash + "?still";
                if (cape.animated) {
                    imageUrls["animated"]["full"] = baseUrl + cape.imageHash + "?animated";
                }
                for (let transform in coordinates) {
                    let transformUrl = baseUrl + transform + "/" + cape.imageHash;
                    json[transform + "ImageUrl"] = transformUrl;
                    imageUrls["base"]["" + transform] = transformUrl;
                    imageUrls["still"]["" + transform] = transformUrl + "?still";
                    if (cape.animated) {
                        imageUrls["animated"]["" + transform] = transformUrl + "?animated";
                    }
                }
            }
            json.imageUrls = imageUrls;
        }
        if (typeof changed !== "undefined") {
            json.changed = changed;
        }
        if (message) {
            json.msg = hasNoCape ? "Player has no cape" : "Cape found"
        }
        return json;
    }


}
