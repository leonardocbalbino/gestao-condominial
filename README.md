# Gestão Condominial

SaaS multi-tenant de gestão condominial. O cliente é a **empresa gestora**, que administra seus condomínios. Especificação completa e regras do produto em [CLAUDE.md](CLAUDE.md).

**Estado atual: Fase 1 (MVP financeiro + web + app do morador), em revisão.**

- **Fase 0:** tenancy com RLS, 2FA e link mágico, RBAC com escopo, auditoria encadeada, design tokens.
- **Fase 1:**
  - cadastro de blocos, unidades (geração e CSV), pessoas, veículos e proprietários;
  - plano de contas, razão imutável, fechamento mensal com hash e balancete;
  - orçamento e rateio; cobrança pelo broker (Fake e Asaas sandbox) com webhooks idempotentes e baixa automática;
  - contas a pagar com aprovação; conciliação diária com fila de exceções;
  - comunicados com "Li e entendi";
  - painel web, portal do morador e app Expo.

## Estrutura

```
apps/api            NestJS (monólito modular)
  migrations/       SQL versionado (fonte da verdade do schema)
  src/db/           Drizzle, contexto por requisição, migrações, bootstrap
  src/http/         guard, interceptor de transação/permissão/auditoria
  src/outbox/       outbox transacional, relay e workers (Redis/BullMQ)
  src/modules/      identity · org · audit · platform · documents · ledger ·
                    billing · communication
  test/             isolamento, catálogo, auditoria, e2e e aceite da Fase 1
apps/web            Next.js (App Router): painel da equipe + portal do morador
apps/mobile         Expo (expo-router): app do morador
packages/contracts  schemas Zod, tipos e formatação compartilhados (API, web, mobile)
packages/ui         tokens de design e tema white label (web + React Native)
packages/config     tsconfig, ESLint, Prettier
infra/              docker-compose de dev; infra/deploy para homologação
docs/adr/           decisões de arquitetura
```

## Rodando localmente

Requisitos: Node 22 (`.nvmrc`), pnpm 12 e Docker.

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp apps/api/.env.example apps/api/.env
pnpm db:bootstrap   # cria papéis app_owner/app_user/app_platform e o banco
pnpm db:migrate
pnpm db:seed        # dados fictícios de demonstração (só dev)
pnpm --filter @condo/api dev                          # API em :3333 (com workers)
pnpm --filter @condo/web dev                          # web em :3000
EXPO_PUBLIC_API_URL=http://<ip-da-máquina>:3333 pnpm --filter @condo/mobile start
```

- O broker padrão é o **Fake** (`PAYMENT_PROVIDER=fake`). Na aba Cobrança, o botão "Simular pagamento" gera e entrega o webhook. Para o sandbox do Asaas, use `PAYMENT_PROVIDER=asaas` e a chave da conta-mãe **de sandbox**.
- Painéis de apoio: Mailpit (e-mails e links mágicos) em http://localhost:8025 e console do MinIO em http://localhost:9001.

## Qualidade

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- Os testes de integração da API precisam do Postgres e do Redis do docker-compose. Eles criam e recriam o banco `condo_test` sozinhos.
- `pnpm --filter @condo/api exec vitest run --project unit` roda só os testes sem infraestrutura.
- O aceite da Fase 1 está em `apps/api/test/fase1-aceite.e2e.test.ts`.
- O CI (GitHub Actions) roda formatação, lint, typecheck e testes, com Postgres 16 e Redis como serviços.

## Homologação (servidor)

`infra/deploy/docker-compose.yml` sobe, como projeto Compose `condo`:

- Postgres, Redis e MinIO, com o bucket versionado;
- Mailpit;
- as migrações;
- a API (`apps/api/Dockerfile`) e o web (`apps/web/Dockerfile`).

Com `DEPLOY_ENV=homolog`, o broker é o Fake.

```bash
cd infra/deploy
cp .env.example .env   # gere segredos novos; nunca reutilize os de dev
docker compose up -d --build
```

- O banco, o Redis e o MinIO não expõem porta no host.
- A credencial de superusuário do Postgres só existe no serviço `migrate`.
- O Mailpit escuta só em `127.0.0.1`; o acesso é por túnel SSH.

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

## API

Rotas com permissão exigem o header `x-gestora-id`. Rota sem regra de acesso declarada é negada por padrão. `C` = `/condominios/:id`, `U` = `C/units/:unitId`.

| Área                 | Rotas principais                                                                                                 | Permissão                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Autenticação         | `/auth/login`, `/auth/magic-link[/consume]`, `/auth/mfa/{enroll,verify}`, `/auth/refresh`, `/auth/logout`, `/me` | público / autenticado                                                    |
| Plataforma           | `/platform/gestoras`                                                                                             | super admin + 2FA                                                        |
| Papéis               | `/roles`, `/role-assignments`, `C/staff-invites[/:a/resend]`                                                     | `role:manage`                                                            |
| Condomínio           | `/condominios`, `C`, `C/config`, `C/implantacao`                                                                 | `condominio:*`                                                           |
| Cadastro             | `C/blocks[/generate]`, `C/units[/import]`, `U`, `U/vehicles`, `U/grants[/owner]`, `/persons`                     | `unidade:*`, `pessoa:*` (morador: `unidade:read` na unidade)             |
| Anexos               | `C/attachments`, `C/attachments/:id/content`                                                                     | `documento:upload`, `financeiro:read`                                    |
| Razão                | `C/ledger/{setup,accounts,periods,entries}`, `…/periods/:p/{close,verify,entries,balancete}`                     | `contas:manage`, `lancamento:create`, `periodo:close`, `financeiro:read` |
| Cobrança             | `C/billing/account`, `C/budgets`, `C/rateio/{preview,emit}`, `C/charges[/inadimplencia]`, `U/charges`            | `orcamento:manage`, `cobranca:*`, `inadimplencia:read`                   |
| Contas a pagar       | `C/payables`, `…/:p/{approve,approve-second,reject,reject-second,pay}`                                           | `pagamento:*`                                                            |
| Conciliação          | `C/reconciliation/{run,lines,lines/:l/resolve}`                                                                  | `conciliacao:manage`, `financeiro:read`                                  |
| Comunicados e início | `C/announcements`, `U/announcements[/:a/read]`, `U/home`                                                         | `comunicado:*`, `unidade:read`                                           |
| Webhooks             | `/webhooks/:provider/:gestoraId/:condominioId`                                                                   | token da subconta                                                        |
