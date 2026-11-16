# ADR-0006 — Razão contábil, períodos e comprovantes

- Status: aceito
- Data: 2026-11-16

## Decisões do produto (confirmadas)

- **Regime de caixa** no balancete e na prestação de contas. Cada lançamento guarda a data de competência e a data de caixa. O período vem da data de caixa.
- **Plano de contas padrão** (proposto e aprovado): ativo disponível, saldos iniciais e receitas e despesas separadas por destino (ordinária, fundo de reserva, obras), com nomes do dia a dia.
- Rateio com sobra de centavos pelo **maior resto** e fundo de reserva como **% sobre a taxa** entram no billing (ADR seguinte).

## Desenho

**Plano de contas.**

- A gestora tem um modelo (`account.condominio_id` nulo), criado do plano padrão no primeiro uso. Ela pode acrescentar contas.
- Ao iniciar a contabilidade, cada condomínio recebe uma cópia do modelo e passa a ter plano próprio.
- Contas com `papel_sistema` (banco, taxa ordinária, fundo de reserva, multa, juros, tarifa…) são as que a automação usa.
- `caixa = true` marca as contas de dinheiro.

**Razão imutável, no banco** (não só na API):

- Partidas dobradas com sinal: débito > 0, crédito < 0.
- Um _constraint trigger_ diferido confere no COMMIT: soma zero, pelo menos duas linhas e, em **saída de caixa** (crédito em conta de caixa), comprovante anexado.
- Triggers recusam `UPDATE`, `DELETE` e `TRUNCATE` em lançamentos e linhas, até para o dono do schema e para o superusuário.
- **Correção é estorno**: um lançamento novo com as linhas invertidas, motivo obrigatório e no máximo um estorno por lançamento. O estorno herda o comprovante do original.
- Automações passam `origem` + `origem_ref`, com índice único. Reprocessar o mesmo evento (webhook repetido) nunca duplica lançamento.

**Períodos.**

- Um por mês e condomínio. Lançar com data de caixa depois do último mês cria os meses que faltam, até 13 de uma vez, para pegar ano digitado errado.
- Data de caixa em **mês fechado** vai para o primeiro período aberto seguinte e guarda a data real (regra §3.4: o ajuste entra no período aberto).
- **Fechamento**: os meses fecham em ordem. A API trava o período (`FOR UPDATE`) e grava `ledger_period_hash`, o SHA-256 do JSON canônico dos lançamentos em ordem de `seq` (inclui o hash de cada comprovante). O status passa a `em_revisao`.
  - Lançamentos travam o período com `FOR SHARE`, então um lançamento concorrente ou entra no hash ou é recusado.
  - Um trigger recalcula o hash no fechamento e impede mudar hash, mês ou condomínio depois.
  - `GET …/verify` recalcula e compara.

**Comprovantes.**

- Upload multipart. O tipo é conferido pelo conteúdo (PDF, PNG, JPEG, WEBP), com limite de 15 MB.
- O SHA-256 é calculado no recebimento. A chave no storage é o próprio hash, num bucket S3/MinIO com versionamento.
- Ao baixar, o conteúdo é conferido contra o hash gravado.

## Custos

- Receitas e despesas acumulam entre exercícios. O encerramento anual (demonstrativo da AGO) é da Fase 2.
- O saldo por fundo é o resultado acumulado do grupo. O saldo de abertura vai para "Saldos iniciais" e não é separado por fundo.
