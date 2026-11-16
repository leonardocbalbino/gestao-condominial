-- Fase 1 — cadastro: blocos, unidades, veículos, vínculo pessoa↔unidade e permissões da fase.

-- ---------------------------------------------------------------------------
-- Integridade entre tenants: filhos apontam para (id, gestora_id) / (id, condominio_id)
-- do pai, então um registro nunca referencia outro de gestora ou condomínio diferente.
-- ---------------------------------------------------------------------------

ALTER TABLE condominio ADD CONSTRAINT condominio_id_gestora_key UNIQUE (id, gestora_id);
ALTER TABLE person ADD CONSTRAINT person_id_gestora_key UNIQUE (id, gestora_id);

CREATE TABLE block (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid NOT NULL,
  nome           text NOT NULL,
  andares        int CHECK (andares IS NULL OR andares BETWEEN 0 AND 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE (condominio_id, nome),
  UNIQUE (id, condominio_id)
);

CREATE TABLE unit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid NOT NULL,
  -- Nulo para condomínios sem blocos (ex.: casas).
  block_id       uuid,
  andar          int,
  numero         text NOT NULL CHECK (length(numero) BETWEEN 1 AND 20),
  tipo           text NOT NULL CHECK (tipo IN ('apartamento', 'casa', 'sala', 'loja')),
  -- Fração ideal da convenção. Normalizada no rateio (não precisa somar exatamente 1).
  fracao_ideal   numeric(12, 10) CHECK (fracao_ideal IS NULL OR fracao_ideal > 0),
  path           ltree GENERATED ALWAYS AS (
                   text2ltree(app_scope_label('g', gestora_id) || '.' || app_scope_label('c', condominio_id)
                              || '.' || app_scope_label('u', id))
                 ) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  FOREIGN KEY (block_id, condominio_id) REFERENCES block (id, condominio_id),
  UNIQUE NULLS NOT DISTINCT (condominio_id, block_id, numero),
  UNIQUE (id, condominio_id)
);
CREATE INDEX unit_path_idx ON unit USING gist (path);

CREATE TABLE vehicle (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id     uuid NOT NULL REFERENCES gestora (id),
  condominio_id  uuid NOT NULL,
  unit_id        uuid NOT NULL,
  -- Placa normalizada: 7 caracteres, maiúsculas, sem hífen (padrão antigo e Mercosul).
  placa          varchar(7) NOT NULL CHECK (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  modelo         text,
  cor            text,
  -- Sem DELETE para a API (regra da Fase 0): remoção é lógica e fica no histórico.
  removido_em    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  FOREIGN KEY (unit_id, condominio_id) REFERENCES unit (id, condominio_id)
);
CREATE UNIQUE INDEX vehicle_placa_active_key ON vehicle (condominio_id, placa)
  WHERE removido_em IS NULL;

-- Acesso de uma pessoa a uma unidade. Fase 1: proprietário cadastrado pela gestora.
-- Secundários, inquilinos e dependentes (com convite) entram na Fase 3 sobre esta tabela.
CREATE TABLE unit_access_grant (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id          uuid NOT NULL REFERENCES gestora (id),
  condominio_id       uuid NOT NULL,
  unit_id             uuid NOT NULL,
  person_id           uuid NOT NULL,
  perfil              text NOT NULL
                        CHECK (perfil IN ('proprietario', 'secundario', 'inquilino', 'dependente', 'hospede')),
  permissoes          text[] NOT NULL DEFAULT '{}'
                        CHECK (permissoes <@ ARRAY['avisos', 'reservas', 'portaria', 'pagamento', 'contas']),
  -- Papel 'morador' no escopo da unidade, criado junto com o vínculo (módulo identity).
  role_assignment_id  uuid REFERENCES role_assignment (id),
  concedido_por       uuid REFERENCES app_user (id),
  inicio              timestamptz NOT NULL DEFAULT now(),
  fim                 timestamptz,
  revogado_em         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  FOREIGN KEY (unit_id, condominio_id) REFERENCES unit (id, condominio_id),
  FOREIGN KEY (person_id, gestora_id) REFERENCES person (id, gestora_id),
  CHECK (fim IS NULL OR fim > inicio)
);
CREATE INDEX unit_access_grant_unit_idx ON unit_access_grant (unit_id);
CREATE UNIQUE INDEX unit_access_grant_active_key ON unit_access_grant (unit_id, person_id)
  WHERE revogado_em IS NULL;

-- ---------------------------------------------------------------------------
-- Permissões da Fase 1 (espelham PERMISSIONS de @condo/contracts; teste garante)
-- role/role_permission têm RLS forçada: o dono desliga o FORCE só dentro desta transação.
-- ---------------------------------------------------------------------------

ALTER TABLE role NO FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permission NO FORCE ROW LEVEL SECURITY;

INSERT INTO permission (key, description) VALUES
  ('condominio:configure', 'Alterar configurações do condomínio (módulos, cobrança, limites)'),
  ('unidade:read', 'Ver blocos, unidades e veículos'),
  ('unidade:manage', 'Cadastrar blocos, unidades e veículos'),
  ('pessoa:read', 'Ver cadastro de pessoas (CPF mascarado)'),
  ('pessoa:manage', 'Cadastrar pessoas e convidar moradores'),
  ('contas:manage', 'Manter o plano de contas'),
  ('orcamento:manage', 'Elaborar o orçamento anual'),
  ('financeiro:read', 'Ver lançamentos, balancete e relatórios financeiros'),
  ('lancamento:create', 'Lançar receitas e despesas'),
  ('cobranca:manage', 'Gerar rateio e emitir cobranças'),
  ('cobranca:read', 'Ver cobranças e pagamentos'),
  ('pagamento:request', 'Cadastrar contas a pagar'),
  ('pagamento:approve', 'Aprovar contas a pagar'),
  ('pagamento:approve_second', 'Segunda assinatura em pagamentos acima do limite'),
  ('conciliacao:manage', 'Conciliar extrato e tratar exceções'),
  ('periodo:close', 'Fechar o mês'),
  ('inadimplencia:read', 'Ver inadimplência nominal'),
  ('comunicado:publish', 'Publicar comunicados'),
  ('comunicado:read', 'Ler comunicados');

-- Gestora: tudo, exceto aprovar pagamentos (matriz §9).
INSERT INTO role_permission (role_id, permission_key)
  SELECT r.id, p.key FROM role r CROSS JOIN permission p
   WHERE r.gestora_id IS NULL AND r.key = 'gestora_admin'
     AND p.key NOT IN ('pagamento:approve', 'pagamento:approve_second')
  ON CONFLICT DO NOTHING;

-- O morador recebe o papel só no escopo da própria unidade (via unit_access_grant):
-- unidade:read e cobranca:read ali significam "a minha unidade" e "as minhas cobranças".
INSERT INTO role_permission (role_id, permission_key)
  SELECT r.id, p.key FROM role r
    JOIN (VALUES
      ('sindico', 'unidade:read'), ('sindico', 'pessoa:read'), ('sindico', 'pessoa:manage'),
      ('sindico', 'financeiro:read'), ('sindico', 'cobranca:read'),
      ('sindico', 'pagamento:approve'), ('sindico', 'inadimplencia:read'),
      ('sindico', 'comunicado:publish'), ('sindico', 'comunicado:read'),
      ('conselheiro', 'unidade:read'), ('conselheiro', 'financeiro:read'),
      ('conselheiro', 'cobranca:read'), ('conselheiro', 'pagamento:approve_second'),
      ('conselheiro', 'inadimplencia:read'), ('conselheiro', 'comunicado:read'),
      ('morador', 'unidade:read'), ('morador', 'cobranca:read'), ('morador', 'comunicado:read')
    ) AS p (role_key, key) ON p.role_key = r.key
   WHERE r.gestora_id IS NULL;

ALTER TABLE role FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permission FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS e privilégios
-- ---------------------------------------------------------------------------

ALTER TABLE block ENABLE ROW LEVEL SECURITY;
ALTER TABLE block FORCE ROW LEVEL SECURITY;
ALTER TABLE unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle FORCE ROW LEVEL SECURITY;
ALTER TABLE unit_access_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_access_grant FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON block TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON unit TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON vehicle TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON unit_access_grant TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());

GRANT SELECT, INSERT, UPDATE ON block, unit, vehicle, unit_access_grant TO app_user;
