# Gestão Condominial

SaaS multi-tenant de gestão condominial. O cliente é a **empresa gestora**, que administra seus condomínios. Especificação completa e regras do produto em [CLAUDE.md](CLAUDE.md).

**Estado atual: Fase 0 (fundação).** Inclui:

- tenancy com RLS;
- autenticação com 2FA e link mágico;
- RBAC com escopo;
- auditoria encadeada;
- design tokens.

## Estrutura

```
apps/api            NestJS (monólito modular)
  migrations/       SQL versionado (fonte da verdade do schema)
  src/db/           Drizzle, contexto por requisição, migrações, bootstrap
  src/http/         guard, interceptor de transação/permissão/auditoria
  src/modules/      identity · org · audit · platform
  test/             isolamento de tenant, catálogo, auditoria, e2e
packages/contracts  schemas Zod e tipos compartilhados (API, web, mobile)
packages/ui         tokens de design e tema white label (web + React Native)
packages/config     tsconfig, ESLint, Prettier
infra/              docker-compose (Postgres 16, Redis, MinIO, Mailpit)
docs/adr/           decisões de arquitetura
```

`apps/web` e `apps/mobile` entram na Fase 1.

## Rodando localmente

Requisitos: Node 22 (`.nvmrc`), pnpm 12 e Docker.

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp apps/api/.env.example apps/api/.env
pnpm db:bootstrap   # cria papéis app_owner/app_user/app_platform e o banco
pnpm db:migrate
pnpm db:seed        # dados fictícios de demonstração (só dev)
pnpm --filter @condo/api dev
```

Painéis: Mailpit (e-mails/links mágicos) em http://localhost:8025 · console do MinIO em http://localhost:9001.

## Qualidade

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Os testes da API precisam do Postgres do docker-compose. Eles criam e recriam o banco `condo_test` sozinhos. O CI (GitHub Actions) roda formatação, lint, typecheck e testes com Postgres 16 como serviço.

## Decisões principais

### ORM: Drizzle, com migrações em SQL escritas à mão

Detalhes em [ADR-0001](docs/adr/0001-drizzle-e-migracoes-sql.md). O isolamento entre gestoras depende de várias peças de banco que precisam ficar explícitas e revisáveis no diff, e não saindo de um gerador:

- políticas RLS;
- papéis de banco sem `BYPASSRLS`;
- triggers append-only;
- `ltree`.

Além disso, o Drizzle permite setar o tenant (`SET LOCAL`) na mesma transação da requisição de forma direta. No Prisma isso exige transações interativas em cada query. O custo é escrever cada mudança de schema duas vezes (SQL + espelho TS); um teste de drift compara os dois.

### Isolamento de tenant

Detalhes em [ADR-0002](docs/adr/0002-tenancy-com-rls.md).

- Uma transação por requisição, com `app.gestora_id` setado por `set_config(..., true)`.
- Toda tabela com `gestora_id` tem RLS **forçada**. Sem contexto, zero linhas.
- A API usa um papel de banco sem `BYPASSRLS`, sem posse das tabelas e sem `DELETE`.

### Identidade e super admin

Detalhes em [ADR-0003](docs/adr/0003-identidade-global-e-super-admin.md).

- O login é global; os dados pessoais ficam em `person`, por gestora.
- 2FA (TOTP) é obrigatório para staff e super admin.
- O super admin usa `/platform` com outro papel de banco e políticas próprias.

### Auditoria

Detalhes em [ADR-0004](docs/adr/0004-auditoria-encadeada.md).

- `audit_log` é append-only e encadeado por hash no próprio banco.
- Toda mutação precisa gravar auditoria na mesma transação, senão a requisição falha e é desfeita.

## API (Fase 0)

| Método   | Rota                                           | Acesso                                  |
| -------- | ---------------------------------------------- | --------------------------------------- |
| POST     | `/auth/login`                                  | público (limite de taxa)                |
| POST     | `/auth/magic-link`, `/auth/magic-link/consume` | público                                 |
| POST     | `/auth/mfa/enroll`, `/auth/mfa/verify`         | token de 2FA                            |
| POST     | `/auth/refresh`, `/auth/logout`                | refresh token                           |
| GET      | `/me`                                          | autenticado                             |
| GET/POST | `/condominios`, GET `/condominios/:id`         | `condominio:read` / `condominio:create` |
| GET/POST | `/roles`, POST `/role-assignments`             | `role:manage` (com anti-escalada)       |
| GET      | `/audit/verify`                                | `audit:read`                            |
| GET/POST | `/platform/gestoras`                           | super admin + 2FA                       |

Rotas com permissão exigem o header `x-gestora-id`. Rota sem regra de acesso declarada é negada por padrão.
