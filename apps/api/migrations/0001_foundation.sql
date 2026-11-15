-- Fase 0 — fundação: tenancy (RLS), identidade, RBAC com escopo e auditoria encadeada.
-- Executada como app_owner. Papéis app_user/app_platform são criados por `db:bootstrap`.

-- ---------------------------------------------------------------------------
-- Contexto da requisição (setado com set_config(..., true) dentro da transação)
-- ---------------------------------------------------------------------------

CREATE FUNCTION app_current_gestora() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.gestora_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Rótulo ltree a partir de um uuid: 'g' + uuid sem hífens. Ex.: g3f2a...
CREATE FUNCTION app_scope_label(prefix text, id uuid) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT prefix || replace(id::text, '-', '') $$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE gestora (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  cnpj        varchar(14) NOT NULL UNIQUE,
  branding    jsonb NOT NULL DEFAULT '{}'::jsonb,
  path        ltree GENERATED ALWAYS AS (text2ltree(app_scope_label('g', id))) STORED,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Identidade global (login). Dados pessoais ficam em `person`, por gestora.
CREATE TABLE app_user (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text NOT NULL,
  cpf                  varchar(11),
  password_hash        text,
  totp_secret_enc      text,
  totp_enabled_at      timestamptz,
  totp_last_step       bigint,
  is_platform_admin    boolean NOT NULL DEFAULT false,
  disabled_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_user_email_lower CHECK (email = lower(email))
);
CREATE UNIQUE INDEX app_user_email_key ON app_user (email);
CREATE UNIQUE INDEX app_user_cpf_key ON app_user (cpf) WHERE cpf IS NOT NULL;

CREATE TABLE refresh_session (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user (id),
  family_id    uuid NOT NULL,
  token_hash   char(64) NOT NULL UNIQUE,
  mfa          boolean NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES refresh_session (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_session_family_idx ON refresh_session (family_id);

CREATE TABLE magic_link_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user (id),
  token_hash  char(64) NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE person (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id  uuid NOT NULL REFERENCES gestora (id),
  user_id     uuid REFERENCES app_user (id),
  nome        text NOT NULL,
  cpf         varchar(11),
  email       text,
  telefone    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gestora_id, user_id),
  UNIQUE (gestora_id, cpf)
);

CREATE TABLE condominio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id  uuid NOT NULL REFERENCES gestora (id),
  nome        text NOT NULL,
  cnpj        varchar(14) NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  path        ltree GENERATED ALWAYS AS (
                text2ltree(app_scope_label('g', gestora_id) || '.' || app_scope_label('c', id))
              ) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gestora_id, cnpj)
);
CREATE INDEX condominio_path_idx ON condominio USING gist (path);

-- Catálogo global de permissões (espelha PERMISSIONS de @condo/contracts; teste garante).
CREATE TABLE permission (
  key          text PRIMARY KEY,
  description  text NOT NULL
);

-- gestora_id NULL = papel de sistema, visível para todas as gestoras.
CREATE TABLE role (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id    uuid REFERENCES gestora (id),
  key           text NOT NULL,
  name          text NOT NULL,
  requires_mfa  boolean NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (gestora_id, key)
);

CREATE TABLE role_permission (
  role_id         uuid NOT NULL REFERENCES role (id),
  permission_key  text NOT NULL REFERENCES permission (key),
  gestora_id      uuid REFERENCES gestora (id),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE role_assignment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id    uuid NOT NULL REFERENCES gestora (id),
  user_id       uuid NOT NULL REFERENCES app_user (id),
  role_id       uuid NOT NULL REFERENCES role (id),
  -- Escopo: g<gestora> (gestora inteira) ou g<gestora>.c<condominio> (um condomínio).
  scope_path    ltree NOT NULL,
  -- Copiado do papel na atribuição: permite exigir 2FA sem ler papéis de outras gestoras.
  requires_mfa  boolean NOT NULL,
  valid_from    timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz,
  revoked_at    timestamptz,
  granted_by    uuid REFERENCES app_user (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_assignment_scope_in_gestora
    CHECK (subpath(scope_path, 0, 1) = text2ltree(app_scope_label('g', gestora_id))),
  CONSTRAINT role_assignment_validity CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX role_assignment_user_idx ON role_assignment (user_id);
CREATE INDEX role_assignment_scope_idx ON role_assignment USING gist (scope_path);

-- ---------------------------------------------------------------------------
-- Auditoria append-only encadeada por hash (uma cadeia por gestora + 'platform')
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gestora_id     uuid REFERENCES gestora (id),
  chain          text NOT NULL,
  seq            bigint NOT NULL,
  actor_user_id  uuid,
  action         text NOT NULL,
  resource_type  text NOT NULL,
  resource_id    text,
  before         jsonb,
  after          jsonb,
  ip             inet,
  request_id     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  prev_hash      char(64) NOT NULL,
  hash           char(64) NOT NULL,
  UNIQUE (chain, seq)
);

-- Ponta de cada cadeia. Acessível só pelo dono (via funções SECURITY DEFINER).
CREATE TABLE audit_chain_head (
  chain      text PRIMARY KEY,
  last_seq   bigint NOT NULL,
  last_hash  char(64) NOT NULL
);

-- Hash canônico de uma linha. jsonb::text tem ordem de chaves determinística no Postgres,
-- e a data entra como microssegundos desde a época para não depender de TimeZone.
CREATE FUNCTION audit_row_hash(r audit_log) RETURNS char(64)
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT encode(sha256(convert_to(
      r.prev_hash || '|' || jsonb_build_object(
        'chain', r.chain,
        'seq', r.seq,
        'gestora_id', r.gestora_id,
        'actor_user_id', r.actor_user_id,
        'action', r.action,
        'resource_type', r.resource_type,
        'resource_id', r.resource_id,
        'before', r.before,
        'after', r.after,
        'ip', host(r.ip),
        'request_id', r.request_id,
        'created_at_us', (extract(epoch FROM r.created_at) * 1000000)::bigint
      )::text, 'UTF8')), 'hex')
  $$;

CREATE FUNCTION audit_log_chain() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_chain text := coalesce(NEW.gestora_id::text, 'platform');
    v_seq   bigint;
    v_prev  char(64);
  BEGIN
    INSERT INTO audit_chain_head (chain, last_seq, last_hash)
      VALUES (v_chain, 0, repeat('0', 64))
      ON CONFLICT (chain) DO NOTHING;

    -- O lock na ponta serializa inserções concorrentes da mesma cadeia.
    SELECT last_seq, last_hash INTO v_seq, v_prev
      FROM audit_chain_head WHERE chain = v_chain FOR UPDATE;

    NEW.chain := v_chain;
    NEW.seq := v_seq + 1;
    NEW.prev_hash := v_prev;
    NEW.created_at := clock_timestamp();
    NEW.hash := audit_row_hash(NEW);

    UPDATE audit_chain_head SET last_seq = NEW.seq, last_hash = NEW.hash WHERE chain = v_chain;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

CREATE FUNCTION audit_log_reject_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION 'audit_log é append-only (% bloqueado)', TG_OP; END $$;

CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_change();

-- Ponta da cadeia para verificação (detecta remoção do final). app_user só consulta a
-- cadeia da gestora em contexto; app_platform (que já lê toda a auditoria) consulta qualquer uma.
CREATE FUNCTION audit_chain_tip(p_chain text, OUT last_seq bigint, OUT last_hash char(64))
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT (session_user = 'app_platform' OR p_chain = app_current_gestora()::text) THEN
      RAISE EXCEPTION 'sem acesso à cadeia %', p_chain;
    END IF;
    SELECT h.last_seq, h.last_hash INTO last_seq, last_hash
      FROM audit_chain_head h WHERE h.chain = p_chain;
  END
  $$;

-- Verifica a cadeia visível ao chamador (SECURITY INVOKER: respeita RLS).
CREATE FUNCTION audit_verify_chain(p_chain text)
  RETURNS TABLE (ok boolean, checked bigint, broken_seq bigint, reason text)
  LANGUAGE plpgsql STABLE
  AS $$
  DECLARE
    r        audit_log;
    v_prev   char(64) := repeat('0', 64);
    v_seq    bigint := 0;
    v_tip    record;
  BEGIN
    FOR r IN SELECT * FROM audit_log WHERE chain = p_chain ORDER BY seq LOOP
      IF r.seq <> v_seq + 1 THEN
        RETURN QUERY SELECT false, v_seq, r.seq, 'sequência com lacuna';
        RETURN;
      END IF;
      IF r.prev_hash <> v_prev THEN
        RETURN QUERY SELECT false, v_seq, r.seq, 'prev_hash não confere';
        RETURN;
      END IF;
      IF audit_row_hash(r) <> r.hash THEN
        RETURN QUERY SELECT false, v_seq, r.seq, 'conteúdo alterado';
        RETURN;
      END IF;
      v_prev := r.hash;
      v_seq := r.seq;
    END LOOP;

    SELECT * INTO v_tip FROM audit_chain_tip(p_chain);
    IF coalesce(v_tip.last_seq, 0) <> v_seq OR coalesce(v_tip.last_hash, repeat('0', 64)) <> v_prev THEN
      RETURN QUERY SELECT false, v_seq, v_seq + 1, 'final da cadeia removido';
      RETURN;
    END IF;

    RETURN QUERY SELECT true, v_seq, NULL::bigint, NULL::text;
  END
  $$;

-- ---------------------------------------------------------------------------
-- Catálogo de permissões e papéis de sistema (antes de ligar RLS)
-- ---------------------------------------------------------------------------

INSERT INTO permission (key, description) VALUES
  ('condominio:create', 'Criar condomínios'),
  ('condominio:read', 'Ver dados cadastrais do condomínio'),
  ('role:manage', 'Criar papéis e atribuí-los a usuários'),
  ('audit:read', 'Ver e verificar a trilha de auditoria');

INSERT INTO role (gestora_id, key, name, requires_mfa) VALUES
  (NULL, 'gestora_admin', 'Administrador da gestora', true),
  (NULL, 'sindico', 'Síndico', true),
  (NULL, 'conselheiro', 'Conselheiro', true),
  (NULL, 'morador', 'Morador', false);

INSERT INTO role_permission (role_id, permission_key)
  SELECT r.id, p.key FROM role r CROSS JOIN permission p
   WHERE r.gestora_id IS NULL AND r.key = 'gestora_admin';

INSERT INTO role_permission (role_id, permission_key)
  SELECT r.id, 'condominio:read' FROM role r
   WHERE r.gestora_id IS NULL AND r.key IN ('sindico', 'conselheiro');

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE gestora ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestora FORCE ROW LEVEL SECURITY;
ALTER TABLE person ENABLE ROW LEVEL SECURITY;
ALTER TABLE person FORCE ROW LEVEL SECURITY;
ALTER TABLE condominio ENABLE ROW LEVEL SECURITY;
ALTER TABLE condominio FORCE ROW LEVEL SECURITY;
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE role FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission FORCE ROW LEVEL SECURITY;
ALTER TABLE role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignment FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- app_user (API): tudo restrito à gestora em contexto.
CREATE POLICY tenant_isolation ON person TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON condominio TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());

-- O usuário enxerga as próprias atribuições em qualquer gestora (lista "minhas gestoras", 2FA).
CREATE POLICY tenant_or_self_read ON role_assignment FOR SELECT TO app_user
  USING (gestora_id = app_current_gestora() OR user_id = app_current_user());
CREATE POLICY tenant_write ON role_assignment FOR INSERT TO app_user
  WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_update ON role_assignment FOR UPDATE TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());

CREATE POLICY visible_gestora ON gestora FOR SELECT TO app_user
  USING (
    id = app_current_gestora()
    OR id IN (SELECT ra.gestora_id FROM role_assignment ra WHERE ra.user_id = app_current_user())
  );

CREATE POLICY system_or_tenant_read ON role FOR SELECT TO app_user
  USING (
    gestora_id IS NULL
    OR gestora_id = app_current_gestora()
    OR id IN (SELECT ra.role_id FROM role_assignment ra WHERE ra.user_id = app_current_user())
  );
CREATE POLICY tenant_write ON role FOR INSERT TO app_user
  WITH CHECK (gestora_id = app_current_gestora());

CREATE POLICY system_or_tenant_read ON role_permission FOR SELECT TO app_user
  USING (gestora_id IS NULL OR gestora_id = app_current_gestora());
CREATE POLICY tenant_write ON role_permission FOR INSERT TO app_user
  WITH CHECK (gestora_id = app_current_gestora());

-- Auditoria: lê só a própria cadeia; grava na própria ou na cadeia 'platform' (eventos de login).
CREATE POLICY tenant_read ON audit_log FOR SELECT TO app_user
  USING (gestora_id = app_current_gestora());
CREATE POLICY tenant_or_platform_append ON audit_log FOR INSERT TO app_user
  WITH CHECK (gestora_id IS NULL OR gestora_id = app_current_gestora());

-- app_platform (super admin, caminho /platform): visão entre gestoras, sem BYPASSRLS.
CREATE POLICY platform_all ON gestora TO app_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_all ON person TO app_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_read ON condominio FOR SELECT TO app_platform USING (true);
CREATE POLICY platform_read ON role FOR SELECT TO app_platform USING (true);
CREATE POLICY platform_read ON role_permission FOR SELECT TO app_platform USING (true);
CREATE POLICY platform_all ON role_assignment TO app_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_read ON audit_log FOR SELECT TO app_platform USING (true);
CREATE POLICY platform_append ON audit_log FOR INSERT TO app_platform WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Privilégios (negados por padrão; concedidos tabela a tabela). Nenhum DELETE.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON FUNCTION audit_chain_tip(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user, app_platform;
GRANT EXECUTE ON FUNCTION audit_chain_tip(text) TO app_user, app_platform;

GRANT SELECT ON gestora TO app_user;
GRANT SELECT, INSERT, UPDATE ON app_user, refresh_session, magic_link_token TO app_user;
GRANT SELECT, INSERT, UPDATE ON person, condominio TO app_user;
GRANT SELECT ON permission TO app_user;
GRANT SELECT, INSERT ON role, role_permission TO app_user;
GRANT SELECT, INSERT, UPDATE ON role_assignment TO app_user;
GRANT SELECT, INSERT ON audit_log TO app_user;

GRANT SELECT, INSERT, UPDATE ON gestora, app_user TO app_platform;
GRANT SELECT, INSERT ON person, role_assignment, magic_link_token TO app_platform;
GRANT SELECT ON condominio, permission, role, role_permission TO app_platform;
GRANT SELECT, INSERT ON audit_log TO app_platform;
