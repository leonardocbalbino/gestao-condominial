/**
 * Ambiente dos testes. Credenciais fictícias que batem com infra/docker-compose.yml.
 * No CI, as mesmas variáveis podem ser sobrescritas pelo ambiente.
 */
const pg = (user: string, password: string, db = 'condo_test'): string =>
  `postgres://${user}:${password}@localhost:5432/${db}`;

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_ADMIN_URL: pg('postgres', 'postgres', 'postgres'),
  DATABASE_OWNER_URL: pg('app_owner', 'dev-owner-password'),
  DATABASE_URL: pg('app_user', 'dev-app-password'),
  DATABASE_PLATFORM_URL: pg('app_platform', 'dev-platform-password'),
  JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters!!',
  // 32 bytes em base64 — chave fictícia só para testes.
  APP_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  SMTP_URL: 'smtp://localhost:1025',
  APP_WEB_URL: 'http://localhost:3000',
  AUTH_RATE_LIMIT_PER_MINUTE: '1000',
  REDIS_URL: 'redis://localhost:6379',
  PAYMENT_PROVIDER: 'fake',
  PLATFORM_FEE_CENTAVOS: '150',
  // Os testes trocam o storage por um em memória; estes valores só passam na validação.
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'condo-attachments',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
};

export const testEnv: Record<string, string> = Object.fromEntries(
  Object.entries(defaults).map(([k, v]) => [k, process.env[k] ?? v]),
);
