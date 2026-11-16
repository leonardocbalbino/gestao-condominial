-- Fase 1 — comunicados com confirmação de leitura ("Li e entendi").

CREATE TABLE announcement (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestora_id         uuid NOT NULL REFERENCES gestora (id),
  condominio_id      uuid NOT NULL,
  titulo             text NOT NULL CHECK (length(titulo) BETWEEN 3 AND 120),
  corpo              text NOT NULL CHECK (length(corpo) BETWEEN 3 AND 5000),
  publicado_por      uuid REFERENCES app_user (id),
  publicado_em       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (condominio_id, gestora_id) REFERENCES condominio (id, gestora_id),
  UNIQUE (id, condominio_id)
);
CREATE INDEX announcement_condominio_idx ON announcement (condominio_id, publicado_em DESC);

-- Confirmação de leitura por pessoa (login), registrada uma única vez.
CREATE TABLE announcement_read (
  announcement_id  uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES app_user (id),
  gestora_id       uuid NOT NULL REFERENCES gestora (id),
  condominio_id    uuid NOT NULL,
  lido_em          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id),
  FOREIGN KEY (announcement_id, condominio_id) REFERENCES announcement (id, condominio_id)
);

ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement FORCE ROW LEVEL SECURITY;
ALTER TABLE announcement_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_read FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON announcement TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());
CREATE POLICY tenant_isolation ON announcement_read TO app_user
  USING (gestora_id = app_current_gestora()) WITH CHECK (gestora_id = app_current_gestora());

GRANT SELECT, INSERT ON announcement, announcement_read TO app_user;
