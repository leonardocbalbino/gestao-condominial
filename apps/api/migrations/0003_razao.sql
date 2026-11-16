-- Fase 1 — anexos (documents) e razão contábil (ledger).
-- Regime de caixa (decisão do produto): o razão registra eventos de caixa; cobranças em
-- aberto ficam no módulo billing. Períodos agrupam lançamentos para o balancete mensal.

-- ---------------------------------------------------------------------------
-- Anexos: arquivo no storage S3 (versionado), hash SHA-256 calculado no upload.
-- ---------------------------------------------------------------------------

CREATE TABLE attachment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid NOT NULL,
  nome_arquivo   text NOT NULL CHECK (length(nome_arquivo) BETWEEN 1 AND 255),
  content_type   text NOT NULL,
  tamanho        bigint NOT NULL CHECK (tamanho > 0),
  sha256         char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key    text NOT NULL,
  uploaded_by    uuid REFERENCES app_user (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE (id, condominio_id)
);

-- ---------------------------------------------------------------------------
-- Plano de contas. condominio_id NULL = modelo da gestora (copiado para cada condomínio).
-- ---------------------------------------------------------------------------

CREATE TABLE account (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid,
  codigo         text NOT NULL CHECK (codigo ~ '^[0-9]+(\.[0-9]+)*$'),
  nome           text NOT NULL CHECK (length(nome) BETWEEN 2 AND 120),
  natureza       text NOT NULL CHECK (natureza IN ('ativo', 'passivo', 'patrimonio', 'receita', 'despesa')),
  -- Destino do dinheiro para a prestação de contas (receitas e despesas).
  grupo          text CHECK (grupo IN ('ordinaria', 'fundo_reserva', 'obras')),
  -- Sintéticas agrupam; só analíticas recebem lançamento.
  analitica      boolean NOT NULL,
  -- Conta de caixa/banco: crédito nela é saída de dinheiro e exige comprovante.
  caixa          boolean NOT NULL DEFAULT false,
  -- Papel usado pela automação (ex.: baixa de cobrança credita 'taxa_ordinaria').
  papel_sistema  text CHECK (papel_sistema IN (
                   'banco', 'saldo_inicial', 'taxa_ordinaria', 'fundo_reserva', 'multa', 'juros',
                   'aluguel_vaga', 'tarifa_bancaria')),
  ativa          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE NULLS NOT DISTINCT (gestora_id, condominio_id, codigo),
  UNIQUE (id, condominio_id),
  CHECK (natureza IN ('receita', 'despesa') OR grupo IS NULL),
  CHECK (NOT caixa OR (natureza = 'ativo' AND analitica))
);
CREATE UNIQUE INDEX account_papel_sistema_key ON account (gestora_id, condominio_id, papel_sistema)
  NULLS NOT DISTINCT WHERE papel_sistema IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Períodos contábeis (um por mês e condomínio)
-- ---------------------------------------------------------------------------

CREATE TABLE accounting_period (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid NOT NULL,
  mes            date NOT NULL CHECK (extract(day FROM mes) = 1),
  status         text NOT NULL DEFAULT 'aberto'
                   CHECK (status IN ('aberto', 'em_revisao', 'aprovado', 'publicado')),
  -- SHA-256 do conjunto de lançamentos no fechamento (ledger_period_hash).
  hash           char(64),
  fechado_em     timestamptz,
  fechado_por    uuid REFERENCES app_user (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE (condominio_id, mes),
  UNIQUE (id, condominio_id),
  CHECK ((status = 'aberto') = (hash IS NULL))
);

-- ---------------------------------------------------------------------------
-- Razão: partidas dobradas, imutável. valor_centavos > 0 = débito, < 0 = crédito.
-- ---------------------------------------------------------------------------

CREATE TABLE journal_entry (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id         uuid NOT NULL REFERENCES gestora (id),
  condominio_id      uuid NOT NULL,
  period_id          uuid NOT NULL,
  -- Ordem estável dentro do condomínio (base do hash do período).
  seq                bigint GENERATED ALWAYS AS IDENTITY,
  data_competencia   date NOT NULL,
  data_caixa         date NOT NULL,
  historico          text NOT NULL CHECK (length(historico) BETWEEN 3 AND 500),
  origem             text NOT NULL CHECK (origem IN (
                       'manual', 'saldo_inicial', 'recebimento', 'pagamento', 'tarifa', 'estorno')),
  -- Id do objeto de origem em outro módulo (cobrança, conta a pagar…), para rastreio.
  origem_ref         text,
  -- Estorno aponta o lançamento original; correção nunca edita, sempre estorna.
  estorno_de         uuid,
  motivo_estorno     text,
  comprovante_id     uuid,
  created_by         uuid REFERENCES app_user (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  FOREIGN KEY (period_id, condominio_id) REFERENCES accounting_period (id, condominio_id),
  FOREIGN KEY (comprovante_id, condominio_id) REFERENCES attachment (id, condominio_id),
  UNIQUE (id, condominio_id),
  FOREIGN KEY (estorno_de, condominio_id) REFERENCES journal_entry (id, condominio_id),
  CHECK ((origem = 'estorno') = (estorno_de IS NOT NULL)),
  CHECK (estorno_de IS NULL OR length(motivo_estorno) >= 5)
);
CREATE INDEX journal_entry_period_idx ON journal_entry (period_id);
-- Um lançamento só pode ser estornado uma vez.
CREATE UNIQUE INDEX journal_entry_estorno_key ON journal_entry (estorno_de) WHERE estorno_de IS NOT NULL;
-- Idempotência de automações: o mesmo evento de origem não gera dois lançamentos.
CREATE UNIQUE INDEX journal_entry_origem_key ON journal_entry (condominio_id, origem, origem_ref)
  WHERE origem_ref IS NOT NULL AND origem <> 'estorno';

CREATE TABLE journal_line (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id       uuid NOT NULL REFERENCES gestora (id),
  condominio_id    uuid NOT NULL,
  entry_id         uuid NOT NULL,
  account_id       uuid NOT NULL,
  valor_centavos   bigint NOT NULL CHECK (valor_centavos <> 0),
  FOREIGN KEY (entry_id, condominio_id) REFERENCES journal_entry (id, condominio_id),
  FOREIGN KEY (account_id, condominio_id) REFERENCES account (id, condominio_id)
);
CREATE INDEX journal_line_entry_idx ON journal_line (entry_id);
CREATE INDEX journal_line_account_idx ON journal_line (account_id);

-- Imutabilidade: nem a API nem o dono alteram ou apagam lançamentos.
CREATE FUNCTION ledger_reject_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'o razão é imutável (% em %); corrija com estorno', TG_OP, TG_TABLE_NAME; END $$;

CREATE TRIGGER journal_entry_immutable BEFORE UPDATE OR DELETE ON journal_entry
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER journal_entry_no_truncate BEFORE TRUNCATE ON journal_entry
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER journal_line_immutable BEFORE UPDATE OR DELETE ON journal_line
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER journal_line_no_truncate BEFORE TRUNCATE ON journal_line
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change();

-- Período fechado não recebe lançamento. FOR SHARE serializa com o fechamento (que trava
-- o período FOR UPDATE): ou o lançamento entra antes e vai para o hash, ou é recusado.
CREATE FUNCTION ledger_check_period_open() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_status text;
  BEGIN
    SELECT status INTO v_status FROM accounting_period WHERE id = NEW.period_id FOR SHARE;
    IF v_status IS DISTINCT FROM 'aberto' THEN
      RAISE EXCEPTION 'período fechado não recebe lançamentos' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER journal_entry_period_open BEFORE INSERT ON journal_entry
  FOR EACH ROW EXECUTE FUNCTION ledger_check_period_open();

-- Só conta analítica e ativa do próprio condomínio recebe linha.
CREATE FUNCTION ledger_check_line_account() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM account WHERE id = NEW.account_id AND analitica AND ativa) THEN
      RAISE EXCEPTION 'conta sintética ou inativa não recebe lançamento' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER journal_line_account_ok BEFORE INSERT ON journal_line
  FOR EACH ROW EXECUTE FUNCTION ledger_check_line_account();

-- No COMMIT: soma das linhas = 0, pelo menos duas linhas, e saída de caixa com comprovante
-- (estornos herdam o comprovante do original). Diferido: as linhas entram uma a uma.
CREATE FUNCTION ledger_check_entry_balanced() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_sum     bigint;
    v_lines   int;
    v_outflow boolean;
    v_entry   journal_entry;
  BEGIN
    SELECT * INTO v_entry FROM journal_entry WHERE id = NEW.entry_id;
    SELECT coalesce(sum(l.valor_centavos), 0), count(*),
           bool_or(a.caixa AND l.valor_centavos < 0)
      INTO v_sum, v_lines, v_outflow
      FROM journal_line l JOIN account a ON a.id = l.account_id
     WHERE l.entry_id = NEW.entry_id;
    IF v_sum <> 0 OR v_lines < 2 THEN
      RAISE EXCEPTION 'lançamento desbalanceado: soma % em % linhas', v_sum, v_lines
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_outflow AND v_entry.comprovante_id IS NULL AND v_entry.origem <> 'estorno' THEN
      RAISE EXCEPTION 'saída de caixa exige comprovante anexado' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END
  $$;
CREATE CONSTRAINT TRIGGER journal_line_balanced AFTER INSERT ON journal_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balanced();

-- Lançamento sem linhas também é recusado no COMMIT.
CREATE FUNCTION ledger_check_entry_has_lines() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM journal_line WHERE entry_id = NEW.id) THEN
      RAISE EXCEPTION 'lançamento sem linhas' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END
  $$;
CREATE CONSTRAINT TRIGGER journal_entry_has_lines AFTER INSERT ON journal_entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_has_lines();

-- Hash canônico do período: lançamentos em ordem de seq, linhas ordenadas por id.
-- jsonb::text tem ordem de chaves determinística; datas como texto ISO.
CREATE FUNCTION ledger_period_hash(p_period_id uuid) RETURNS char(64)
  LANGUAGE sql STABLE
  AS $$
    SELECT encode(sha256(convert_to(coalesce(string_agg(entry_json, E'\n' ORDER BY seq), ''), 'UTF8')), 'hex')
      FROM (
        SELECT e.seq, jsonb_build_object(
                 'id', e.id,
                 'data_competencia', e.data_competencia::text,
                 'data_caixa', e.data_caixa::text,
                 'historico', e.historico,
                 'origem', e.origem,
                 'origem_ref', e.origem_ref,
                 'estorno_de', e.estorno_de,
                 'motivo_estorno', e.motivo_estorno,
                 'comprovante_id', e.comprovante_id,
                 'comprovante_sha256', (SELECT a.sha256 FROM attachment a WHERE a.id = e.comprovante_id),
                 'linhas', (SELECT jsonb_agg(jsonb_build_object('conta', l.account_id, 'valor', l.valor_centavos)
                                             ORDER BY l.id)
                              FROM journal_line l WHERE l.entry_id = e.id)
               )::text AS entry_json
          FROM journal_entry e
         WHERE e.period_id = p_period_id
      ) s
  $$;

-- Período fechado: nada muda além do avanço de status (Fase 2: revisão → publicação).
CREATE FUNCTION ledger_guard_period() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status <> 'aberto' AND (NEW.hash IS DISTINCT FROM OLD.hash OR NEW.mes <> OLD.mes
        OR NEW.condominio_id <> OLD.condominio_id) THEN
      RAISE EXCEPTION 'período fechado é imutável' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'aberto' AND NEW.status <> 'aberto' THEN
      IF NEW.hash IS DISTINCT FROM ledger_period_hash(NEW.id) THEN
        RAISE EXCEPTION 'hash do fechamento não confere com os lançamentos' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER accounting_period_guard BEFORE UPDATE ON accounting_period
  FOR EACH ROW EXECUTE FUNCTION ledger_guard_period();

-- ---------------------------------------------------------------------------
-- Permissão de envio de comprovantes (gestora; síndico via papel customizado)
-- ---------------------------------------------------------------------------

ALTER TABLE role NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permission NO FORCE ROW LEVEL SECURITY;
INSERT INTO permission (key, description) VALUES
  ('documento:upload', 'Enviar comprovantes e documentos');
INSERT INTO role_permission (role_id, permission_key)
  SELECT r.id, 'documento:upload' FROM role r WHERE r.gestora_id IS NULL AND r.key = 'gestora_admin';
ALTER TABLE role FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permission FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS e privilégios
-- ---------------------------------------------------------------------------

ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachment FORCE ROW LEVEL SECURITY;
ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE account FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_period FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_line FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON attachment TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON account TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON accounting_period TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON journal_entry TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON journal_line TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());

GRANT SELECT, INSERT ON attachment, journal_entry, journal_line TO app_user;
GRANT SELECT, INSERT, UPDATE ON account, accounting_period TO app_user;
