FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json openapi.yml ./
COPY src ./src
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
