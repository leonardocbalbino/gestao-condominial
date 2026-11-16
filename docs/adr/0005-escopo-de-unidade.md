# ADR-0005 — Escopo de unidade e acesso do morador

- Status: aceito
- Data: 2026-11-16

## Contexto

O morador precisa ver a própria unidade e as próprias cobranças, e nada além disso. A regra §3.8 exige que toda decisão passe pelo `can()` central.

## Decisão

**Escopo de unidade.** O `ltree` ganhou um terceiro nível: `g<gestora>.c<condominio>.u<unidade>`, igual à coluna `unit.path`. Escopos maiores cobrem os menores (`@>`), então gestora e síndico continuam alcançando todas as unidades do seu escopo.

**Mesma permissão, escopo diferente.** Não existem permissões "self". O papel de sistema `morador` tem `unidade:read`, `cobranca:read` e `comunicado:read`, e é atribuído **só** no escopo de uma unidade:

- `unidade:read` no escopo do condomínio (síndico) = ver todas as unidades;
- `unidade:read` no escopo da unidade (morador) = ver a própria.

Rotas de unidade declaram o escopo `{ type: 'unit', condominioParam, unitParam }`. O serviço sempre filtra pelos dois ids, então uma unidade de outro condomínio não aparece nem trocando o parâmetro.

**Vínculo pessoa↔unidade.** `unit_access_grant` (módulo `identity`) guarda perfil, permissões marcadas e validade. Cada vínculo ativo tem uma atribuição do papel `morador` no escopo da unidade. Revogar o vínculo revoga a atribuição na mesma transação, e o efeito é imediato porque o `can()` lê o banco a cada requisição.

- O papel `morador` não pode ser atribuído por `/role-assignments`; só nasce do vínculo.
- Fase 1: só o proprietário, cadastrado por gestora ou síndico, que recebe convite por link mágico. Secundários, inquilinos e expiração automática entram na Fase 3 sobre a mesma tabela.

**Integridade entre tenants.** Tabelas filhas referenciam `(id, gestora_id)` e `(id, condominio_id)` do pai. Um bloco de um condomínio não pode receber unidade de outro, nem um vínculo apontar para pessoa de outra gestora. Isso vale mesmo se a aplicação errar.

**"Síndico lança despesas: configurável" (matriz §9).** É resolvido com papéis como dados: a gestora cria um papel customizado com `lancamento:create` e atribui ao síndico daquele condomínio.

**Gestora não aprova pagamento.** `gestora_admin` tem todas as permissões, exceto `pagamento:approve` e `pagamento:approve_second`. A gestora prepara a conta; síndico e conselho aprovam.

## Custos

- Cada vínculo cria duas linhas (vínculo + atribuição), mantidas juntas pelo módulo `identity`.
- Veículos não são apagados: a API não tem `DELETE` (regra da Fase 0), então a remoção é lógica (`removido_em`).
