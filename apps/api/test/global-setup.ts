import { bootstrapDatabase, resetDatabase } from '../src/db/bootstrap';
import { runMigrations } from '../src/db/migrate';
import { testEnv } from './test-env';

/** Recria o banco de testes do zero e aplica as migrações, uma vez por execução. */
export default async function setup(): Promise<void> {
  const urls = {
    adminUrl: testEnv.DATABASE_ADMIN_URL ?? '',
    ownerUrl: testEnv.DATABASE_OWNER_URL ?? '',
    appUrl: testEnv.DATABASE_URL ?? '',
    platformUrl: testEnv.DATABASE_PLATFORM_URL ?? '',
  };
  try {
    await bootstrapDatabase(urls);
  } catch (error) {
    throw new Error(
      `Não foi possível preparar o Postgres de testes (${(error as Error).message}). ` +
        'Suba a infraestrutura com: docker compose -f infra/docker-compose.yml up -d',
      { cause: error },
    );
  }
  await resetDatabase(urls);
  await runMigrations(urls.ownerUrl);
}
