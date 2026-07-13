FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ARG W7S_DOCKER_BRANCH=local
ARG W7S_DOCKER_COMMIT_HASH=unknown
ARG W7S_DOCKER_DEPLOYED_AT=unknown
ENV NODE_ENV=production
ENV W7S_DOCKER_BRANCH=$W7S_DOCKER_BRANCH
ENV W7S_DOCKER_COMMIT_HASH=$W7S_DOCKER_COMMIT_HASH
ENV W7S_DOCKER_DEPLOYED_AT=$W7S_DOCKER_DEPLOYED_AT
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "dist/src/server.js"]
