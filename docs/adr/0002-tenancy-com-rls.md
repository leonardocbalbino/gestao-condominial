# ADR-0002 — Isolamento de tenant com RLS por transação

- Status: aceito
- Data: 2026-11-15

## Decisão

**Papéis de banco**, criados por `pnpm db:bootstrap`:

| Papel          | Uso                                    | Observação                                                 |
| -------------- | -------------------------------------- | ---------------------------------------------------------- |
| `app_owner`    | dono do schema, roda migrações         | nunca usado pela API                                       |
| `app_user`     | toda a API                             | `NOBYPASSRLS`, não é dono de nada, sem `DELETE`/`TRUNCATE` |
| `app_platform` | só o caminho `/platform` (super admin) | `NOBYPASSRLS`, políticas próprias (ver ADR-0003)           |

**Contexto por requisição.** O `RequestPipelineInterceptor` abre **uma transação por requisição** e executa `set_config('app.gestora_id', …, true)` e `set_config('app.user_id', …, true)`. Com o terceiro argumento `true`, a configuração vale só até o fim da transação: a conexão volta ao pool limpa. A transação fica no `AsyncLocalStorage`, e os serviços a obtêm com `currentContext()`. Acessar o banco fora de um contexto lança erro.

**Políticas.** Toda tabela com `gestora_id` tem `ENABLE` + `FORCE ROW LEVEL SECURITY` e política `gestora_id = app_current_gestora()`. Sem contexto, a função retorna `NULL` e nenhuma linha passa. Exceções deliberadas:

- `role_assignment`: o usuário lê **as próprias** atribuições em qualquer gestora (lista "minhas gestoras" e exigência de 2FA).
- `role` / `role_permission`: papéis de sistema (`gestora_id IS NULL`) são legíveis por todos.
- `audit_log`: inserção na cadeia `platform` (eventos de login, sem tenant) é permitida.

**Escopo hierárquico com `ltree`.** Gestora = `g<uuid>`, condomínio = `g<uuid>.c<uuid>`. Uma atribuição com escopo de gestora cobre os condomínios dela (`scope_path @> path`). Torres e unidades entram como níveis seguintes na Fase 1.

**Gestora em contexto.** Rotas com permissão exigem o header `x-gestora-id`. O header não concede nada sozinho: `can()` exige uma atribuição ativa naquela gestora.

## Testes que garantem a decisão

- `tenant-isolation.test.ts`:
  - sem contexto, zero linhas;
  - A não lê, não altera, não insere e não move dados para B;
  - o contexto não vaza entre transações.
- `schema-catalog.test.ts`:
  - toda tabela com `gestora_id` tem RLS forçada e políticas;
  - toda tabela sem `gestora_id` está numa lista justificada;
  - papéis de runtime não são donos nem `BYPASSRLS` e não têm `DELETE`.

## Custos

- Uma transação por requisição, inclusive em leituras. O custo é pequeno no Postgres, e é o preço de o contexto nunca vazar.
- Jobs e filas (Fase 1) precisarão abrir o próprio contexto com `runInContext`.
