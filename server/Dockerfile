# BlueChip profiles service — multi-stage build keeps the runtime image small.
FROM node:22-alpine AS build
WORKDIR /app
# better-sqlite3 compiles a native module; alpine needs the toolchain.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PROFILES_DB=/data/profiles.db \
    PROFILES_PORT=4317
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
VOLUME /data
EXPOSE 4317
CMD ["node", "dist/index.js"]
