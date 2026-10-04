# api.capes.dev
Minecraft Capes API, History & CDN

[API Docs](https://rest.wiki/?https://api.capes.dev/openapi.yml)

## Database indexes
The cape collection uses compound indexes (see `src/database/schemas/cape.ts`).
After changing them, build them before deploying, so the app doesn't have to build them on startup,
and drop the indexes they replace:
```
npm run build
npm run migrate-indexes
```
