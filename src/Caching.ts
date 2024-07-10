import {AsyncLoadingCache, Caches, CacheStats, ICacheBase, SimpleCache, Time} from "@inventivetalent/loading-cache";
import * as Sentry from "@sentry/node";
import {Requests} from "./Requests";
import {User} from "./typings/User";
import {Maybe, stripUuid} from "./util";
import {ProfileProperty, ProfileResponse} from "./typings/ProfileResponse";
import {ICapeDocument} from "./typings/ICapeDocument";
import {Cape} from "./database/schemas/cape";
import {AxiosRequestConfig, AxiosResponse} from "axios";

export class Caching {

    //// REQUESTS

    protected static readonly userByNameCache: AsyncLoadingCache<string, User> = Caches.builder()
        .expireAfterWrite(Time.minutes(5))
        .expirationInterval(Time.minutes(1))
        .buildAsync<string, User>(name => {
            return Requests.mojangApiRequest({
                url: "/users/profiles/minecraft/" + name,
            }).then(response => {
                let d = {
                    valid: false,
                    uuid: undefined,
                    name: name
                } as User;
                if (response.data && response.data.hasOwnProperty("id")) {
                    const body = response.data;
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
                Sentry.captureException(err, {
                    level: "warning",
                    tags: {
                        cache: "userByName"
                    }
                });
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
            return Requests.mojangSessionRequest({
                url: "/session/minecraft/profile/" + uuid
            }).then(response => {
                let d = {
                    valid: false,
                    uuid: uuid,
                    name: undefined
                } as User;
                if (response.data && response.data.hasOwnProperty("name")) {
                    const body = response.data;
                    d = {
                        valid: true,
                        uuid: uuid,
                        name: body["name"]
                    } as User;
                    // update other cache
                    Caching.userByNameCache.put(d.name!.toLowerCase(), d);
                }
                return d;
            }).catch(err => {
                Sentry.captureException(err, {
                    level: "warning",
                    tags: {
                        cache: "userByUuid"
                    }
                });
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
                Sentry.captureException(err, {
                    level: "warning",
                    tags: {
                        cache: "userProfile"
                    }
                });
                return undefined;
            });
        });

    protected static readonly capeLoadCache: AsyncLoadingCache<AxiosRequestConfig, AxiosResponse> = Caches.builder()
        .expireAfterWrite(Time.minutes(1))
        .expirationInterval(Time.seconds(10))
        .buildAsync<AxiosRequestConfig, AxiosResponse>(request => Requests.capeLoadRequest(request));


    //// DATABASE

    protected static readonly capeByHashCache: AsyncLoadingCache<string, ICapeDocument> = Caches.builder()
        .expireAfterWrite(Time.minutes(5))
        .expirationInterval(Time.minutes(1))
        .buildAsync<string, ICapeDocument>(hash => Cape.findByHash(hash));

    /// REQUESTS

    public static loadCape(request: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.capeLoadCache.get(request);
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

    public static getUserProfile(uuid: string) {
        return this.userProfileCache.get(uuid);
    }


    /// DATABASE

    public static getCapeByHash(hash: string): Promise<Maybe<ICapeDocument>> {
        return this.capeByHashCache.get(hash);
    }

    public static cacheCape(cape: ICapeDocument): ICapeDocument {
        this.capeByHashCache.put(cape.hash, cape);
        return cape;
    }

}
