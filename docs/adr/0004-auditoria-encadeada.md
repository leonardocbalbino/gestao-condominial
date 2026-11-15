# ADR-0004 — Auditoria append-only encadeada por hash no banco

- Status: aceito
- Data: 2026-11-15

## Decisão

**Cadeias.** Há uma cadeia por gestora (`chain = gestora_id`) e uma cadeia `platform` para eventos sem tenant, como login.

**Encadeamento no banco.** O trigger `audit_log_chain` (`SECURITY DEFINER`) faz o seguinte a cada inserção:

1. trava a ponta da cadeia (`audit_chain_head … FOR UPDATE`);
2. atribui `seq = último + 1` e `prev_hash = hash anterior`;
3. calcula `hash = sha256(prev_hash || '|' || jsonb canônico da linha)`.

Valores de `seq`/`hash` enviados pela aplicação são ignorados. Inserções concorrentes ficam serializadas por cadeia.

**Canonicidade.** O `jsonb::text` do Postgres tem ordem de chaves determinística. A data entra como microssegundos desde a época, para não depender de fuso.

**Append-only.** Triggers bloqueiam `UPDATE`, `DELETE` e `TRUNCATE`, inclusive para o dono do schema. Os papéis de runtime só têm `SELECT`/`INSERT`.

**Verificação.** `audit_verify_chain(chain)` recalcula a cadeia e detecta:

- conteúdo alterado;
- lacuna na sequência;
- remoção do final, comparando com a ponta guardada em `audit_chain_head`.

Exposta em `GET /audit/verify` (permissão `audit:read`).

**Toda mutação é auditada.** O `AuditService.record` grava na **mesma transação** da mutação. O `RequestPipelineInterceptor` rejeita, com rollback, qualquer requisição `POST`/`PUT`/`PATCH`/`DELETE` que termine sem nenhuma linha de auditoria. Isso é **fail-closed**: esquecer de auditar quebra o endpoint em vez de passar em silêncio. Erros que precisam persistir efeitos (como o reuso de refresh token) usam `CommitThenFail`.

## Limites conhecidos

- Um superusuário do Postgres pode desligar os triggers e reescrever a cadeia inteira de forma consistente. O hash detecta adulteração parcial, não reescrita total. A mitigação planejada é **ancorar periodicamente o hash da ponta fora do banco** (no pacote de exportação do auditor, Fase 2).
- Falhas de login não geram linha de auditoria, porque a transação é desfeita. Elas vão para o log estruturado (pino), com limite de taxa nas rotas de autenticação.
