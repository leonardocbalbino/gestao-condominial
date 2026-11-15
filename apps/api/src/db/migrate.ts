import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Aplica `migrations/*.sql` em ordem, cada arquivo numa transação, como app_owner.
 * Um arquivo já aplicado não pode mudar: o checksum é conferido a cada execução.
 */
export async function runMigrations(
  ownerUrl: string,
  dir = MIGRATIONS_DIR,
): Promise<MigrationResult> {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        name        text PRIMARY KEY,
        checksum    char(64) NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);
    // Impede duas execuções simultâneas (ex.: duas instâncias subindo juntas).
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['schema_migration']);

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Map(
      (
        await client.query<{ name: string; checksum: string }>(
          'SELECT name, checksum FROM schema_migration',
        )
      ).rows.map((r) => [r.name, r.checksum]),
    );

    for (const file of files) {
      const sqlText = await readFile(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sqlText).digest('hex');
      const previous = applied.get(file);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migração ${file} foi alterada depois de aplicada. Crie uma nova migração.`,
          );
        }
        result.skipped.push(file);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sqlText);
        await client.query('INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha ao aplicar ${file}: ${(error as Error).message}`, { cause: error });
      }
      result.applied.push(file);
    }
    return result;
  } finally {
    await client.end();
  }
}
