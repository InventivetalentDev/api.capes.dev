import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { JobQueue } from "jobqu";
import { Time } from "@inventivetalent/loading-cache";
import { URL } from "url";
import { metrics } from "./util/metrics";
import * as Sentry from "@sentry/node";

axios.defaults.headers["User-Agent"] = "capes.dev (+https://capes.dev)";
axios.defaults.timeout = 20000;

export const REQUESTS_METRIC = metrics.metric('capes', 'requests');

export class Requests {

    static readonly axiosInstance: AxiosInstance = axios.create({});

    protected static readonly capeLoadInstance: AxiosInstance = axios.create({});

    protected static readonly mojangApiInstance: AxiosInstance = axios.create({
        baseURL: "https://api.mojang.com"
    });
    protected static readonly mojangSessionInstance: AxiosInstance = axios.create({
        baseURL: "https://sessionserver.mojang.com"
    });

    protected static readonly capeLoadRequestQueue: JobQueue<AxiosRequestConfig, AxiosResponse>
        = new JobQueue<AxiosRequestConfig, AxiosResponse>((request: AxiosRequestConfig) => Requests.runAxiosRequest(request, Requests.capeLoadInstance), Time.seconds(0.5));
    protected static readonly mojangApiRequestQueue: JobQueue<AxiosRequestConfig, AxiosResponse>
        = new JobQueue<AxiosRequestConfig, AxiosResponse>((request: AxiosRequestConfig) => Requests.runAxiosRequest(request, Requests.mojangApiInstance), Time.seconds(1));
    protected static readonly mojangSessionRequestQueue: JobQueue<AxiosRequestConfig, AxiosResponse>
        = new JobQueue<AxiosRequestConfig, AxiosResponse>((request: AxiosRequestConfig) => Requests.runAxiosRequest(request, Requests.mojangSessionInstance), Time.seconds(1));


    protected static runAxiosRequest(request: AxiosRequestConfig, instance = this.axiosInstance): Promise<AxiosResponse> {
        return instance.request(request)
            .then(response => this.processRequestMetric(response, request, response, instance))
            .catch(err => this.processRequestMetric(err, request, err.response, instance, err))
    }

    static processRequestMetric<T>(responseOrError: T, request?: AxiosRequestConfig, response?: AxiosResponse, instance?: AxiosInstance, err?: any): T {
        try {
            const m = REQUESTS_METRIC;
            if (request) {
                const url = new URL(axios.getUri(request), instance?.defaults.baseURL);
                m.tag("method", request.method || "GET")
                    .tag("host", url.hostname);
            }
            if (response) {
                m.tag("statusCode", "" + response.status)
            }
            m.inc();
        } catch (e) {
            Sentry.captureException(e);
        }
        if (err) {
            throw err;
        }
        return responseOrError;
    }

    public static capeLoadRequest(request: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.capeLoadRequestQueue.add(request);
    }

    public static mojangApiRequest(request: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.mojangApiRequestQueue.add(request);
    }

    public static mojangSessionRequest(request: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.mojangSessionRequestQueue.add(request);
    }

}
