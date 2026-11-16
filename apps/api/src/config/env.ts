import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Onde a API roda. NODE_ENV=production vale para homologação e produção (otimizações);
   * só DEPLOY_ENV=production proíbe o broker fake e o seed de demonstração.
   */
  DEPLOY_ENV: z.enum(['local', 'homolog', 'production']).default('local'),
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
  /** URL pública da API (webhooks do broker apontam para cá). */
  APP_API_URL: z.url().default('http://localhost:3333'),
  REDIS_URL: z.url(),
  /** Liga os workers e o relay do outbox neste processo (desligado em scripts). */
  WORKERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PAYMENT_PROVIDER: z.enum(['fake', 'asaas']).default('fake'),
  ASAAS_BASE_URL: z.url().default('https://api-sandbox.asaas.com/v3'),
  /** Chave da conta-mãe (sandbox) que cria as subcontas. Obrigatória só com asaas. */
  ASAAS_ROOT_API_KEY: z.string().optional(),
  /** Tarifa da plataforma por cobrança paga, via split para a carteira da plataforma. */
  PLATFORM_WALLET_ID: z.string().optional(),
  PLATFORM_FEE_CENTAVOS: z.coerce.number().int().min(0).default(0),
  // Storage S3-compatível (MinIO em dev), bucket com versionamento ligado.
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(3),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variáveis de ambiente inválidas: ${fields}`);
  }
  const env = parsed.data;
  if (env.PAYMENT_PROVIDER === 'asaas' && !env.ASAAS_ROOT_API_KEY) {
    throw new Error('ASAAS_ROOT_API_KEY é obrigatória com PAYMENT_PROVIDER=asaas');
  }
  if (env.DEPLOY_ENV === 'production' && env.PAYMENT_PROVIDER === 'fake') {
    throw new Error('O provedor fake não pode ser usado em produção');
  }
  if (
    env.PLATFORM_FEE_CENTAVOS > 0 &&
    env.PAYMENT_PROVIDER === 'asaas' &&
    !env.PLATFORM_WALLET_ID
  ) {
    throw new Error('PLATFORM_WALLET_ID é obrigatória quando há tarifa da plataforma');
  }
  return env;
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
