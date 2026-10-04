# api.capes.dev
Minecraft Capes API, History & CDN

[API Docs](https://rest.wiki/?https://api.capes.dev/openapi.yml)

## Running with Docker

```sh
cp .env.example .env   # fill in Cloudflare/Sentry/Influx settings
docker compose up -d --build
```

This starts an nginx load balancer on `HTTP_PORT` (default 3026) in front of `APP_REPLICAS` API containers, plus a local MongoDB (enabled by `COMPOSE_PROFILES=local-db` in `.env`).
Change the number of replicas with `docker compose up -d --scale app=4`; nginx picks up new replicas without a restart.

All settings are environment variables, documented in [`.env.example`](.env.example). Each one also accepts a `<NAME>_FILE` variant pointing at a file, e.g. a docker secret.
An existing `config.js` still works: mount it and set `CONFIG_FILE=/path/to/config.js`. Environment variables override what's in the file. This is also how to keep using the MongoDB SSH tunnel.

Every push to `master` publishes the image to `ghcr.io/inventivetalentdev/api.capes.dev` (`:latest` and the short commit sha), so servers can `docker compose pull` it instead of building it.

### Health checks

- `GET /health`: liveness, `200` while the process is up.
- `GET /ready`: readiness, `200` only when the instance is started, connected to MongoDB and not shutting down; otherwise `503`. Use this one for load balancers. The docker `HEALTHCHECK` uses it too.

## Scaling across multiple servers

The API containers keep no state of their own, so any number of them can run on any number of servers, as long as they share one MongoDB.

1. Run a MongoDB that every server can reach, preferably a replica set, and set `MONGO_URL` to its connection string. Remove `COMPOSE_PROFILES=local-db` from `.env` so no local database starts.
2. On every server, use the same `.env` and run `docker compose pull && docker compose up -d`.
3. Point an outer load balancer (e.g. Cloudflare Load Balancing, or DNS with several A records) at each server's `HTTP_PORT`, with a health check on `/ready`.
4. To deploy a new version, run `scripts/rolling-update.sh` on each server (`--build` to build locally instead of pulling). It starts new replicas next to the old ones, waits until they are healthy, then gracefully stops the old ones, so no requests fail. A plain `docker compose up -d` also works, but it restarts all of a server's replicas at the same time.

How instances cooperate:

- **Background jobs run only once.** The `/stats` aggregation scans the whole collection. Only one instance runs it: instances compete for a lease in the `leases` collection. The result goes into `stats_snapshots`, and every instance serves `/stats` from there. If the instance holding the lease stops, it releases the lease, and another instance takes over within a minute. If it crashes instead, another instance takes over once the lease expires, within about 4 minutes. Influx gets each stats point once, not once per instance.
- **Graceful shutdown.** On `SIGTERM`, an instance releases its leases and switches `/ready` to `503`. It keeps serving for `SHUTDOWN_DELAY` ms (default 5000) so that load balancers can take it out of rotation, then finishes its in-flight requests and exits.
- **Fail fast.** An instance exits instead of staying up half-broken: on a failed startup, or when the MongoDB driver stops trying to reconnect. Docker's restart policy then starts it again.
- **Fewer duplicate loads.** Concurrent `/load` requests for the same cape on one instance share a single upstream fetch. nginx routes the same URL to the same replica, so repeated requests for a player hit warm caches. If two instances store the same cape in the same second, both requests return the stored cape instead of a duplicate key error.
- Upstream request rate limits (Mojang etc.) apply per instance. That fits because upstreams rate limit per IP, and each server has its own IP.
