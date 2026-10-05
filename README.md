# api.capes.dev
Minecraft Capes API, History & CDN

[API Docs](https://rest.wiki/?https://api.capes.dev/openapi.yml)

## Configuration

The app is configured with environment variables, see [`.env.example`](.env.example).
Outside of docker, they can be loaded from a file with `node --env-file=.env dist/index.js`.

## Docker

```sh
cp .env.example .env   # and fill it in
docker compose up -d --build
```

Inside the container, `localhost` is the container itself, so MongoDB and InfluxDB need addresses that the container can reach.
If you use the MongoDB SSH tunnel, also mount the key file and point `MONGO_TUNNEL_KEY_FILE` at it.
