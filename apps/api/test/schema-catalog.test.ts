import { PERMISSIONS, SYSTEM_ROLES } from '@condo/contracts';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { afterAll, describe, expect, it } from 'vitest';
import { schema } from '../src/db/schema';
import { closeTestPools, testPools } from './support/db';

/**
 * Tabelas sem gestora_id, cada uma com o motivo. Uma tabela nova sem gestora_id faz o
 * teste falhar até alguém decidir, explicitamente, que ela é global.
 */
const GLOBAL_TABLES: Record<string, string> = {
  gestora: 'é o próprio tenant (RLS pelo id)',
  app_user: 'login é global (ADR-0003); dados pessoais ficam em person',
  refresh_session: 'sessão do usuário global',
  magic_link_token: 'login do usuário global',
  permission: 'catálogo de permissões do sistema',
  audit_chain_head: 'interna do encadeamento; acessível só pelo dono',
  schema_migration: 'controle de migrações',
};

const RUNTIME_ROLES = ['app_user', 'app_platform'];

afterAll(closeTestPools);

describe('catálogo do banco', () => {
  it('toda tabela com gestora_id tem RLS ativa, forçada e com políticas', async () => {
    const { rows } = await testPools().admin.query<{
      table: string;
      rls: boolean;
      forced: boolean;
      policies: number;
    }>(`
      SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'gestora_id')`);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect({ table: row.table, rls: row.rls, forced: row.forced }).toEqual({
        table: row.table,
        rls: true,
        forced: true,
      });
      expect(row.policies, `${row.table} sem políticas`).toBeGreaterThan(0);
    }
  });

  it('toda tabela sem gestora_id está na lista de tabelas globais justificadas', async () => {
    const { rows } = await testPools().admin.query<{ table: string }>(`
      SELECT c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE c.relkind = 'r'
         AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'gestora_id')`);
    expect(rows.map((r) => r.table).sort()).toEqual(Object.keys(GLOBAL_TABLES).sort());
  });

  it('papéis de runtime não são donos, nem superusuários, nem ignoram RLS', async () => {
    const { rows } = await testPools().admin.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      owns: number;
    }>(
      `SELECT r.rolname, r.rolsuper, r.rolbypassrls,
              (SELECT count(*)::int FROM pg_class c WHERE c.relowner = r.oid) AS owns
         FROM pg_roles r WHERE r.rolname = ANY($1)`,
      [RUNTIME_ROLES],
    );
    expect(rows).toHaveLength(RUNTIME_ROLES.length);
    for (const row of rows) {
      expect(row).toMatchObject({ rolsuper: false, rolbypassrls: false, owns: 0 });
    }
  });

  it('nenhum papel de runtime tem DELETE ou TRUNCATE em tabela alguma', async () => {
    const { rows } = await testPools().admin.query(
      `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = ANY($1) AND privilege_type IN ('DELETE', 'TRUNCATE')`,
      [RUNTIME_ROLES],
    );
    expect(rows).toEqual([]);
  });

  it('o schema Drizzle bate com as colunas do banco (sem drift)', async () => {
    const { rows } = await testPools().admin.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    for (const table of Object.values(schema) as PgTable[]) {
      const config = getTableConfig(table);
      const dbColumns = rows
        .filter((r) => r.table_name === config.name)
        .map((r) => r.column_name)
        .sort();
      const codeColumns = config.columns.map((c) => c.name).sort();
      expect(codeColumns, `colunas de ${config.name}`).toEqual(dbColumns);
    }
  });

  it('o catálogo de permissões do banco é igual ao de @condo/contracts', async () => {
    const { rows } = await testPools().admin.query<{ key: string; description: string }>(
      'SELECT key, description FROM permission',
    );
    expect(Object.fromEntries(rows.map((r) => [r.key, r.description]))).toEqual(PERMISSIONS);
  });

  it('os papéis de sistema do banco são iguais aos de @condo/contracts', async () => {
    const { rows } = await testPools().admin.query<{
      key: string;
      name: string;
      requires_mfa: boolean;
      permissions: string[];
    }>(`
      SELECT r.key, r.name, r.requires_mfa,
             coalesce(array_agg(rp.permission_key ORDER BY rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL), '{}') AS permissions
        FROM role r LEFT JOIN role_permission rp ON rp.role_id = r.id
       WHERE r.gestora_id IS NULL
       GROUP BY r.key, r.name, r.requires_mfa`);
    const fromDb = Object.fromEntries(
      rows.map((r) => [
        r.key,
        { name: r.name, requiresMfa: r.requires_mfa, permissions: r.permissions },
      ]),
    );
    const fromContracts = Object.fromEntries(
      Object.entries(SYSTEM_ROLES).map(([key, role]) => [
        key,
        {
          name: role.name,
          requiresMfa: role.requiresMfa,
          permissions: [...role.permissions].sort(),
        },
      ]),
    );
    expect(fromDb).toEqual(fromContracts);
  });
});
