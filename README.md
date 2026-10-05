# api.capes.dev
Minecraft Capes API, History & CDN

[API Docs](https://rest.wiki/?https://api.capes.dev/openapi.yml)

## Docker

Create `config.js` from `config.example.js`, then run:

```sh
GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

`config.js` is mounted into the container. Inside the container, `localhost` is the container itself, so MongoDB and InfluxDB need addresses that the container can reach.
If you change `port` in `config.js`, change the port mapping in `docker-compose.yml` to match. If you use the MongoDB SSH tunnel, also mount the key file, e.g. `./id_rsa:/app/id_rsa:ro`.
