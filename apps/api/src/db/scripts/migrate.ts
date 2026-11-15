/* eslint-disable no-console -- script de linha de comando */
import { loadDotEnvFile } from '../../config/env';
import { runMigrations } from '../migrate';
import { requireEnv } from './require-env';

async function main(): Promise<void> {
  loadDotEnvFile();
  const { applied, skipped } = await runMigrations(requireEnv('DATABASE_OWNER_URL'));
  console.log(`Migrações aplicadas: ${applied.length ? applied.join(', ') : 'nenhuma'}`);
  console.log(`Já aplicadas: ${skipped.length}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
