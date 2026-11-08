FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 factory && useradd --system --uid 1001 --gid factory factory
COPY --from=build --chown=factory:factory /app/.next/standalone ./
COPY --from=build --chown=factory:factory /app/.next/static ./.next/static
COPY --from=build --chown=factory:factory /app/public ./public
COPY --from=build --chown=factory:factory /app/migrations ./migrations
USER factory
EXPOSE 3000
CMD ["node","server.js"]
