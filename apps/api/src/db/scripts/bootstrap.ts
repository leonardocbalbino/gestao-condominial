/* eslint-disable no-console -- script de linha de comando */
import { loadDotEnvFile } from '../../config/env';
import { bootstrapDatabase } from '../bootstrap';
import { requireEnv } from './require-env';

async function main(): Promise<void> {
  loadDotEnvFile();
  await bootstrapDatabase({
    adminUrl: requireEnv('DATABASE_ADMIN_URL'),
    ownerUrl: requireEnv('DATABASE_OWNER_URL'),
    appUrl: requireEnv('DATABASE_URL'),
    platformUrl: requireEnv('DATABASE_PLATFORM_URL'),
  });
  console.log('Papéis e banco prontos.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
