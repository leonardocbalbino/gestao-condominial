/* eslint-disable no-console -- script de linha de comando */
import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ENV, loadDotEnvFile, type Env } from '../../config/env';
import { PasswordService } from '../../modules/identity/password.service';
import { UsersService } from '../../modules/identity/users.service';
import { CondominioService } from '../../modules/org/condominio.service';
import { PlatformService } from '../../modules/platform/platform.service';
import { APP_DB, PLATFORM_DB } from '../database.module';
import { runInContext, type Database } from '../request-context';

/**
 * Dados FICTÍCIOS para desenvolvimento local (idempotente). Recusa rodar em produção.
 * Cria o super admin, duas gestoras com admin e condomínios de exemplo, todos com a
 * senha SEED_DEV_PASSWORD. O 2FA é configurado no primeiro login de cada um.
 */
const SUPER_ADMIN = 'super@plataforma.local';
// CNPJs de demonstração: sequência artificial 9000000x/0001 com dígitos verificadores válidos.
const GESTORAS = [
  {
    nome: 'Gestora Alfa (demo)',
    cnpj: '90000001000129',
    admin: 'admin@alfa.local',
    condominios: [
      { nome: 'Residencial Ipê', cnpj: '90000003000118' },
      { nome: 'Edifício Jacarandá', cnpj: '90000004000162' },
    ],
  },
  {
    nome: 'Gestora Beta (demo)',
    cnpj: '90000002000173',
    admin: 'admin@beta.local',
    condominios: [{ nome: 'Condomínio Aroeira', cnpj: '90000005000107' }],
  },
];

async function main(): Promise<void> {
  loadDotEnvFile();
  // Script de uma execução: sem relay do outbox nem workers neste processo.
  process.env.WORKERS_ENABLED = 'false';
  const password = process.env.SEED_DEV_PASSWORD;
  if (!password) throw new Error('Defina SEED_DEV_PASSWORD no .env');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  if (app.get<Env>(ENV).DEPLOY_ENV === 'production')
    throw new Error('Seed de demonstração não roda em produção');

  const platformDb = app.get<Database>(PLATFORM_DB);
  const appDb = app.get<Database>(APP_DB);
  const users = app.get(UsersService);
  const platform = app.get(PlatformService);
  const condominios = app.get(CondominioService);
  const passwordHash = await app.get(PasswordService).hash(password);
  const ctx = (gestoraId: string | null) => ({
    gestoraId,
    userId: null,
    mfa: true,
    ip: null,
    requestId: 'seed-dev',
  });

  for (const g of GESTORAS) {
    const gestoraId = await runInContext(platformDb, ctx(null), async () => {
      const superAdmin = await users.findOrCreateByEmail(SUPER_ADMIN);
      await users.setPlatformAdmin(superAdmin.id);
      await users.setPassword(superAdmin.id, passwordHash);

      const existing = (await platform.listGestoras()).find((e) => e.cnpj === g.cnpj);
      const gestora =
        existing ??
        (await platform.createGestora({
          nome: g.nome,
          cnpj: g.cnpj,
          branding: {},
          admin: { nome: 'Admin Demo', email: g.admin },
        }));
      const admin = await users.findOrCreateByEmail(g.admin);
      await users.setPassword(admin.id, passwordHash);
      return gestora.id;
    });

    // Uma transação por condomínio: um já existente (409) não desfaz os demais.
    for (const c of g.condominios) {
      await runInContext(appDb, ctx(gestoraId), () => condominios.create(c)).catch(
        (error: unknown) => {
          if (!(error instanceof ConflictException)) throw error;
        },
      );
    }
  }

  await app.close();
  console.log('Seed de demonstração concluído. Usuários (senha = SEED_DEV_PASSWORD):');
  console.log(`  ${SUPER_ADMIN} — super admin`);
  for (const g of GESTORAS) console.log(`  ${g.admin} — admin de ${g.nome}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
