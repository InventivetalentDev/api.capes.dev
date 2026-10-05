import {AsyncLoadingCache, Caches, CacheStats, ICacheBase, SimpleCache, Time} from "@inventivetalent/loading-cache";
import {captureUpstreamError} from "./util/sentry";
import {Requests} from "./Requests";
import {User} from "./typings/User";
import {Maybe, stripUuid} from "./util";
import {ProfileProperty, ProfileResponse} from "./typings/ProfileResponse";
import {ICape} from "./typings/ICapeDocument";
import {Cape} from "./database/schemas/cape";
import {AxiosRequestConfig, AxiosResponse} from "axios";

export class Caching {

    //// REQUESTS

    protected static readonly userByNameCache: AsyncLoadingCache<string, User> = Caches.builder()
        .expireAfterWrite(Time.minutes(5))
        .expirationInterval(Time.minutes(1))
        .buildAsync<string, User>(name => {
            return Requests.mojangApiRequest({
                url: "https://mcproxy.dev/name-to-uuid/" + name,
            }).then(response => {
                let d = {
                    valid: false,
                    uuid: undefined,
                    name: name
                } as User;
                if (response.data && response.data.data && response.data.data.hasOwnProperty("id")) {
                    const body = response.data.data;
                    d = {
                        valid: true,
                        uuid: body["id"],
                        name: body["name"]
                    } as User;
                    // update other cache
                    Caching.userByUuidCache.put(d.uuid!, d);
                }
                return d;
            }).catch(err => {
                captureUpstreamError(err, "cache:userByName");
                return {
                    valid: false,
                    uuid: undefined,
                    name: name
                } as User;
            });
        });
    protected static readonly userByUuidCache: AsyncLoadingCache<string, User> = Caches.builder()
        .expireAfterWrite(Time.minutes(5))
        .expirationInterval(Time.minutes(1))
        .buildAsync<string, User>(uuid => {
            uuid = stripUuid(uuid);
            return Requests.mojangApiRequest({
                url: "https://mcproxy.dev/uuid-to-name/" + uuid,
            }).then(response => {
                let d = {
                    valid: false,
                    uuid: uuid,
                    name: undefined
                } as User;
                if (response.data && response.data.data && response.data.data.hasOwnProperty("id")) {
                    const body = response.data.data;
                    d = {
                        valid: true,
                        uuid: body["id"],
                        name: body["name"]
                    } as User;
                    // update other cache
                    Caching.userByUuidCache.put(d.uuid!, d);
                }
                return d;
            }).catch(err => {
                captureUpstreamError(err, "cache:userByUuid");
                return {
                    valid: false,
                    uuid: uuid,
                    name: undefined
                } as User;
            });
        });

    protected static readonly userProfileCache: AsyncLoadingCache<string, ProfileProperty> = Caches.builder()
        .expireAfterWrite(Time.minutes(1))
        .expirationInterval(Time.seconds(10))
        .buildAsync<string, ProfileProperty>(uuid => {
            return Requests.mojangSessionRequest({
                url: "/session/minecraft/profile/" + stripUuid(uuid)
            }).then(response => {
                if (!response.data.hasOwnProperty("properties")) {
                    return undefined;
                }
                const body = response.data as ProfileResponse;
                return body.properties[0] as ProfileProperty;
            }).catch(err => {
                captureUpstreamError(err, "cache:userProfile");
                return undefined;
            });
        });

    // keyed by the serialized request - the cache compares keys by identity, so a config object would never hit
    protected static readonly capeLoadCache: AsyncLoadingCache<string, AxiosResponse> = Caches.builder()
        .expireAfterWrite(Time.minutes(1))
        .expirationInterval(Time.seconds(10))
        .buildAsync<string, AxiosResponse>(request => Requests.capeLoadRequest(JSON.parse(request)));


    //// DATABASE

    protected static readonly capeByHashCache: AsyncLoadingCache<string, ICape> = Caches.builder()
        .expireAfterWrite(Time.minutes(5))
        .expirationInterval(Time.minutes(1))
        .buildAsync<string, ICape>(hash => Cape.findByHash(hash));

    // image urls are derived from the image content hash, so these barely ever change
    protected static readonly capeImageCache: AsyncLoadingCache<string, CapeImageInfo> = Caches.builder()
        .expireAfterWrite(Time.minutes(10))
        .expirationInterval(Time.minutes(1))
        .buildAsync<string, CapeImageInfo>(imageHash => Cape.findOne({imageHash: imageHash}, "-_id hash imageHash type width height extension animated cdn")
            .lean<CapeImageInfo>().exec().then(cape => cape || undefined));

    /// REQUESTS

    // only pass plain, JSON-serializable configs - the cache key is the serialized request
    public static loadCape(request: AxiosRequestConfig): Promise<Maybe<AxiosResponse>> {
        return this.capeLoadCache.get(JSON.stringify(request));
    }

    public static getUserByName(name: string): Promise<Maybe<User>> {
        return this.userByNameCache.get(name.toLowerCase());
    }

    public static getUserByUuid(uuid: string): Promise<Maybe<User>> {
        return this.userByUuidCache.get(uuid);
    }

    public static async getUser(uuidOrName: string): Promise<Maybe<User>> {
        if (uuidOrName.length < 20) { // name
            return this.getUserByName(uuidOrName);
        } else { // uuid
            return this.getUserByUuid(uuidOrName);
        }
    }

    // resolves undefined when the profile lookup failed - callers must check
    public static getUserProfile(uuid: string): Promise<Maybe<ProfileProperty>> {
        return this.userProfileCache.get(uuid);
    }


    /// DATABASE

    public static getCapeByHash(hash: string): Promise<Maybe<ICape>> {
        return this.capeByHashCache.get(hash);
    }

    public static cacheCape(cape: ICape): ICape {
        this.capeByHashCache.put(cape.hash, cape);
        return cape;
    }

    public static getCapeImageInfo(imageHash: string): Promise<Maybe<CapeImageInfo>> {
        return this.capeImageCache.get(imageHash);
    }

}

export type CapeImageInfo = Pick<ICape, "hash" | "imageHash" | "type" | "width" | "height" | "extension" | "animated" | "cdn">;
