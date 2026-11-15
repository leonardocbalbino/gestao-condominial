# ADR-0001 — Drizzle como ORM, migrações em SQL escritas à mão

- Status: aceito
- Data: 2026-11-15

## Contexto

A especificação pede Prisma **ou** Drizzle. O isolamento entre gestoras depende de Row-Level Security: políticas, papéis de banco sem `BYPASSRLS`, `FORCE ROW LEVEL SECURITY`, triggers append-only, funções `SECURITY DEFINER` e a extensão `ltree`. Também exige que o contexto do tenant (`app.gestora_id`) seja setado **dentro da mesma transação** de cada requisição.

## Decisão

- **Drizzle** (`drizzle-orm` + `node-postgres`) para as consultas tipadas.
- **Migrações em SQL puro** em `apps/api/migrations/NNNN_nome.sql`, aplicadas em ordem por um executor próprio (`src/db/migrate.ts`). O executor grava o checksum de cada arquivo e recusa migração já aplicada que tenha sido alterada.
- `src/db/schema.ts` é um espelho tipado do SQL. O teste `schema-catalog` falha se as colunas divergirem.

## Por quê

- RLS, grants, triggers e funções ficam **explícitos e revisáveis** no diff da migração. São a parte mais sensível do sistema e não devem sair de um gerador.
- Transações do Drizzle expõem o client diretamente, então `set_config(..., true)` no início da transação é trivial. No Prisma isso exige `$extends` envolvendo cada query numa transação interativa, o que é frágil, mais lento e difícil de auditar.
- Drizzle trabalha bem com tipos customizados (`ltree`) e SQL cru quando necessário.

## Custos

- Sem geração automática de migração: cada mudança de schema é escrita duas vezes (SQL + espelho TS). O teste de drift reduz o risco de divergência.
- Ferramental de admin/studio menos maduro que o do Prisma.
