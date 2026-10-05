FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json openapi.yml ./
COPY src ./src
RUN npm run build

# there's no .git in the image, so Sentry reads the release from this instead
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA} \
    NODE_ENV=production
CMD ["node", "dist/index.js"]
