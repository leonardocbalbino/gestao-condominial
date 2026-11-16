-- Fase 1 — cobrança: conta no broker, orçamento, rateio, cobranças, webhooks, contas a pagar,
-- conciliação e outbox transacional.

-- Endereço do condomínio (necessário para abrir a subconta no broker).
ALTER TABLE condominio ADD COLUMN endereco jsonb;

-- ---------------------------------------------------------------------------
-- Outbox transacional: eventos gravados na mesma transação da mudança e publicados na
-- fila (BullMQ) depois do COMMIT por um relay. Reentrega é segura: handlers idempotentes.
-- ---------------------------------------------------------------------------

CREATE TABLE outbox_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid,
  topic          text NOT NULL,
  payload        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  processed_at   timestamptz,
  attempts       int NOT NULL DEFAULT 0,
  last_error     text
);
CREATE INDEX outbox_event_unpublished_idx ON outbox_event (created_at) WHERE published_at IS NULL;

-- ---------------------------------------------------------------------------
-- Conta do condomínio no broker (subconta). Chaves cifradas (AES-256-GCM, regra §3.10).
-- ---------------------------------------------------------------------------

CREATE TABLE payment_account (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id           uuid NOT NULL REFERENCES gestora (id),
  condominio_id        uuid NOT NULL UNIQUE,
  provider             text NOT NULL CHECK (provider IN ('fake', 'asaas')),
  provider_account_id  text NOT NULL,
  wallet_id            text,
  api_key_enc          text NOT NULL,
  webhook_token_enc    text NOT NULL,
  -- Última data de extrato já importada pela conciliação.
  extrato_ate          date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE (provider, provider_account_id)
);

-- ---------------------------------------------------------------------------
-- Orçamento anual: previsão mensal por conta de despesa e critério de rateio da linha.
-- "Misto" = linhas com critérios diferentes no mesmo orçamento.
-- ---------------------------------------------------------------------------

CREATE TABLE budget (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid NOT NULL,
  ano            int NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  status         text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado')),
  aprovado_em    timestamptz,
  aprovado_por   uuid REFERENCES app_user (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE (condominio_id, ano),
  UNIQUE (id, condominio_id)
);

CREATE TABLE budget_line (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id            uuid NOT NULL REFERENCES gestora (id),
  condominio_id         uuid NOT NULL,
  budget_id             uuid NOT NULL,
  account_id            uuid NOT NULL,
  valor_mensal_centavos bigint NOT NULL CHECK (valor_mensal_centavos > 0),
  criterio              text NOT NULL CHECK (criterio IN ('fracao_ideal', 'igualitario')),
  FOREIGN KEY (budget_id, condominio_id) REFERENCES budget (id, condominio_id),
  FOREIGN KEY (account_id, condominio_id) REFERENCES account (id, condominio_id),
  UNIQUE (budget_id, account_id)
);

-- ---------------------------------------------------------------------------
-- Cobranças. Uma ordinária por unidade e competência.
-- ---------------------------------------------------------------------------

CREATE TABLE charge (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id          uuid NOT NULL REFERENCES gestora (id),
  condominio_id       uuid NOT NULL,
  unit_id             uuid NOT NULL,
  competencia         date NOT NULL CHECK (extract(day FROM competencia) = 1),
  tipo                text NOT NULL DEFAULT 'ordinaria' CHECK (tipo IN ('ordinaria', 'extra')),
  vencimento          date NOT NULL,
  valor_centavos      bigint NOT NULL CHECK (valor_centavos > 0),
  -- Encargos copiados da configuração no momento da emissão (base da 2ª via).
  multa_bp            int NOT NULL CHECK (multa_bp BETWEEN 0 AND 200),
  juros_mensal_bp     int NOT NULL CHECK (juros_mensal_bp >= 0),
  status              text NOT NULL DEFAULT 'pendente_emissao'
                        CHECK (status IN ('pendente_emissao', 'emitida', 'erro_emissao', 'paga', 'cancelada')),
  pagador_person_id   uuid,
  provider_charge_id  text,
  linha_digitavel     text,
  pix_copia_cola      text,
  boleto_url          text,
  erro_emissao        text,
  pago_em             date,
  valor_pago_centavos bigint,
  created_by          uuid REFERENCES app_user (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  FOREIGN KEY (unit_id, condominio_id) REFERENCES unit (id, condominio_id),
  FOREIGN KEY (pagador_person_id, gestora_id) REFERENCES person (id, gestora_id),
  UNIQUE (id, condominio_id),
  UNIQUE (condominio_id, provider_charge_id),
  CHECK ((status = 'paga') = (pago_em IS NOT NULL AND valor_pago_centavos IS NOT NULL))
);
CREATE UNIQUE INDEX charge_ordinaria_key ON charge (unit_id, competencia)
  WHERE tipo = 'ordinaria' AND status <> 'cancelada';
CREATE INDEX charge_condominio_competencia_idx ON charge (condominio_id, competencia);

CREATE TABLE charge_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id      uuid NOT NULL REFERENCES gestora (id),
  condominio_id   uuid NOT NULL,
  charge_id       uuid NOT NULL,
  account_id      uuid NOT NULL,
  descricao       text NOT NULL,
  valor_centavos  bigint NOT NULL CHECK (valor_centavos > 0),
  FOREIGN KEY (charge_id, condominio_id) REFERENCES charge (id, condominio_id),
  FOREIGN KEY (account_id, condominio_id) REFERENCES account (id, condominio_id)
);
CREATE INDEX charge_item_charge_idx ON charge_item (charge_id);

-- Soma dos itens = valor da cobrança (conferido no COMMIT).
CREATE FUNCTION billing_check_charge_total() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_total bigint;
    v_items bigint;
  BEGIN
    SELECT valor_centavos INTO v_total FROM charge WHERE id = NEW.charge_id;
    SELECT coalesce(sum(valor_centavos), 0) INTO v_items FROM charge_item WHERE charge_id = NEW.charge_id;
    IF v_total <> v_items THEN
      RAISE EXCEPTION 'itens (%) não somam o valor da cobrança (%)', v_items, v_total
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END
  $$;
CREATE CONSTRAINT TRIGGER charge_item_total AFTER INSERT ON charge_item
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION billing_check_charge_total();

-- Itens e valor da cobrança não mudam depois de criados.
CREATE FUNCTION billing_guard_charge() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.valor_centavos <> OLD.valor_centavos OR NEW.unit_id <> OLD.unit_id
       OR NEW.competencia <> OLD.competencia OR NEW.vencimento <> OLD.vencimento THEN
      RAISE EXCEPTION 'valor, unidade, competência e vencimento da cobrança não mudam'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('paga', 'cancelada') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'cobrança % não muda de status', OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER charge_guard BEFORE UPDATE ON charge
  FOR EACH ROW EXECUTE FUNCTION billing_guard_charge();

-- ---------------------------------------------------------------------------
-- Webhooks: evento bruto gravado ANTES de processar; (provider, event_id) único.
-- ---------------------------------------------------------------------------

CREATE TABLE payment_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid NOT NULL,
  provider       text NOT NULL,
  event_id       text NOT NULL,
  tipo           text NOT NULL,
  payload        jsonb NOT NULL,
  recebido_em    timestamptz NOT NULL DEFAULT now(),
  processado_em  timestamptz,
  resultado      text,
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- Contas a pagar: comprovante obrigatório, aprovação do síndico e, acima do limite,
-- segunda assinatura de um conselheiro (pessoa diferente).
-- ---------------------------------------------------------------------------

CREATE TABLE payable (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id               uuid NOT NULL REFERENCES gestora (id),
  condominio_id            uuid NOT NULL,
  fornecedor               text NOT NULL CHECK (length(fornecedor) BETWEEN 2 AND 200),
  fornecedor_documento     varchar(14),
  descricao                text NOT NULL CHECK (length(descricao) BETWEEN 3 AND 500),
  account_id               uuid NOT NULL,
  valor_centavos           bigint NOT NULL CHECK (valor_centavos > 0),
  vencimento               date NOT NULL,
  linha_digitavel          text,
  comprovante_id           uuid NOT NULL,
  requer_segunda_aprovacao boolean NOT NULL,
  status                   text NOT NULL DEFAULT 'aguardando_aprovacao'
                             CHECK (status IN ('aguardando_aprovacao', 'aguardando_segunda_aprovacao',
                                               'aprovada', 'pagamento_solicitado', 'paga', 'rejeitada')),
  aprovado_por             uuid REFERENCES app_user (id),
  aprovado_em              timestamptz,
  segunda_aprovacao_por    uuid REFERENCES app_user (id),
  segunda_aprovacao_em     timestamptz,
  rejeitado_por            uuid REFERENCES app_user (id),
  motivo_rejeicao          text,
  provider_payment_id      text,
  pago_em                  date,
  created_by               uuid REFERENCES app_user (id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  FOREIGN KEY (account_id, condominio_id) REFERENCES account (id, condominio_id),
  FOREIGN KEY (comprovante_id, condominio_id) REFERENCES attachment (id, condominio_id),
  UNIQUE (condominio_id, provider_payment_id),
  CHECK (segunda_aprovacao_por IS NULL OR segunda_aprovacao_por <> aprovado_por),
  CHECK (aprovado_por IS NULL OR aprovado_por <> created_by)
);

-- ---------------------------------------------------------------------------
-- Extrato da subconta e conciliação. Linha sem par vira exceção para a gestora.
-- ---------------------------------------------------------------------------

CREATE TABLE bank_statement_line (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id       uuid NOT NULL REFERENCES gestora (id),
  condominio_id    uuid NOT NULL,
  provider_tx_id   text NOT NULL,
  data             date NOT NULL,
  valor_centavos   bigint NOT NULL,
  descricao        text NOT NULL,
  ref_tipo         text CHECK (ref_tipo IN ('charge', 'bill')),
  ref_id           text,
  status           text NOT NULL CHECK (status IN ('conciliada', 'excecao', 'resolvida')),
  match_entry_id   uuid,
  motivo           text,
  resolvido_por    uuid REFERENCES app_user (id),
  resolvido_em     timestamptz,
  nota_resolucao   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  FOREIGN KEY (match_entry_id, condominio_id) REFERENCES journal_entry (id, condominio_id),
  UNIQUE (condominio_id, provider_tx_id)
);
CREATE INDEX bank_statement_line_excecao_idx ON bank_statement_line (condominio_id) WHERE status = 'excecao';

-- ---------------------------------------------------------------------------
-- RLS e privilégios
-- ---------------------------------------------------------------------------

ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_account FORCE ROW LEVEL SECURITY;
ALTER TABLE budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget FORCE ROW LEVEL SECURITY;
ALTER TABLE budget_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line FORCE ROW LEVEL SECURITY;
ALTER TABLE charge ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge FORCE ROW LEVEL SECURITY;
ALTER TABLE charge_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_item FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_event FORCE ROW LEVEL SECURITY;
ALTER TABLE payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE payable FORCE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_line FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON outbox_event TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON payment_account TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON budget TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON budget_line TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON charge TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON charge_item TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON payment_event TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON payable TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON bank_statement_line TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());

-- O relay do outbox (processo de sistema, sem tenant) usa a conexão app_platform e só
-- enxerga o necessário: id, gestora e estado de publicação dos eventos (ADR-0007).
CREATE POLICY platform_relay ON outbox_event FOR SELECT TO app_platform USING (true);
CREATE POLICY platform_relay_mark ON outbox_event FOR UPDATE TO app_platform USING (true) WITH CHECK (true);
-- A conciliação diária percorre os condomínios com conta no broker.
CREATE POLICY platform_read ON payment_account FOR SELECT TO app_platform USING (true);

GRANT SELECT, INSERT, UPDATE ON outbox_event, payment_account, budget, charge, payment_event,
  payable, bank_statement_line TO app_user;
GRANT SELECT, INSERT ON budget_line, charge_item TO app_user;
GRANT SELECT (id, gestora_id, condominio_id, topic, published_at, created_at),
      UPDATE (published_at) ON outbox_event TO app_platform;
GRANT SELECT (gestora_id, condominio_id) ON payment_account TO app_platform;
