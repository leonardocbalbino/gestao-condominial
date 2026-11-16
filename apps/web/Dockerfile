# Imagem do web (Next.js standalone). Contexto de build: raiz do monorepo.
#   docker build -f apps/web/Dockerfile -t condo-web .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter=@condo/web... \
  && pnpm turbo run build --filter=@condo/web...

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
