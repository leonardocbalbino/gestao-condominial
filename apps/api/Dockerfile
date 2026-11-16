# Imagem da API. Contexto de build: raiz do monorepo.
#   docker build -f apps/api/Dockerfile -t condo-api .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter=@condo/api... \
  && pnpm turbo run build --filter=@condo/api... \
  && pnpm --filter=@condo/api deploy --prod --legacy /out

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3333
CMD ["node", "dist/main.js"]
