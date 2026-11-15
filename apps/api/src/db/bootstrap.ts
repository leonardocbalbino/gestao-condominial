import { Client } from 'pg';

/**
 * Prepara o cluster: papéis de banco e banco de dados. Roda com superusuário
 * (DATABASE_ADMIN_URL), uma vez por ambiente. Idempotente.
 *
 * - app_owner: dono do schema, roda migrações. Nunca usado pela API.
 * - app_user: papel da API. Sujeito a RLS (NOBYPASSRLS, não é dono de nada).
 * - app_platform: caminho do super admin. Também sem BYPASSRLS; tem políticas próprias.
 */
export interface BootstrapUrls {
  adminUrl: string;
  ownerUrl: string;
  appUrl: string;
  platformUrl: string;
}

const quoteIdent = (s: string): string => `"${s.replace(/"/g, '""')}"`;
const quoteLiteral = (s: string): string => `'${s.replace(/'/g, "''")}'`;

function credentials(url: string): { user: string; password: string; database: string } {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

async function withClient<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function bootstrapDatabase(urls: BootstrapUrls): Promise<void> {
  const owner = credentials(urls.ownerUrl);
  const app = credentials(urls.appUrl);
  const platform = credentials(urls.platformUrl);

  await withClient(urls.adminUrl, async (c) => {
    for (const role of [owner, app, platform]) {
      const exists = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.user]);
      const verb = exists.rowCount ? 'ALTER' : 'CREATE';
      await c.query(
        `${verb} ROLE ${quoteIdent(role.user)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${quoteLiteral(role.password)}`,
      );
    }
    const db = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [owner.database]);
    if (!db.rowCount) {
      await c.query(
        `CREATE DATABASE ${quoteIdent(owner.database)} OWNER ${quoteIdent(owner.user)}`,
      );
    }
  });

  const adminOnDb = new URL(urls.adminUrl);
  adminOnDb.pathname = `/${owner.database}`;
  await withClient(adminOnDb.toString(), (c) =>
    prepareSchema(c, owner.user, [app.user, platform.user]),
  );
}

async function prepareSchema(c: Client, ownerRole: string, runtimeRoles: string[]): Promise<void> {
  await c.query(`ALTER SCHEMA public OWNER TO ${quoteIdent(ownerRole)}`);
  await c.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await c.query('CREATE EXTENSION IF NOT EXISTS ltree SCHEMA public');
  for (const role of runtimeRoles) {
    await c.query(
      `GRANT CONNECT ON DATABASE ${quoteIdent(c.database ?? '')} TO ${quoteIdent(role)}`,
    );
  }
}

/** Apaga e recria o schema `public`. Uso exclusivo dos testes. */
export async function resetDatabase(urls: BootstrapUrls): Promise<void> {
  const owner = credentials(urls.ownerUrl);
  const app = credentials(urls.appUrl);
  const platform = credentials(urls.platformUrl);
  if (!owner.database.endsWith('_test')) {
    throw new Error(`resetDatabase recusado: ${owner.database} não é um banco de teste`);
  }
  const adminOnDb = new URL(urls.adminUrl);
  adminOnDb.pathname = `/${owner.database}`;
  await withClient(adminOnDb.toString(), async (c) => {
    await c.query('DROP SCHEMA public CASCADE');
    await c.query(`CREATE SCHEMA public AUTHORIZATION ${quoteIdent(owner.user)}`);
    await prepareSchema(c, owner.user, [app.user, platform.user]);
  });
}
