import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanString,
  DATABASE_URL: z.url(),
  DATABASE_PLATFORM_URL: z.url(),
  JWT_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'Precisa ter 32 bytes em base64'),
  SMTP_URL: z.url(),
  MAIL_FROM: z.string().default('Gestão Condominial <nao-responda@condominio.local>'),
  APP_WEB_URL: z.url(),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variáveis de ambiente inválidas: ${fields}`);
  }
  return parsed.data;
}

/** Carrega `.env` do diretório atual, se existir (Node ≥ 21.7). */
export function loadDotEnvFile(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sem .env: segue com o ambiente do processo (CI, containers).
  }
}

export const ENV = Symbol('ENV');
