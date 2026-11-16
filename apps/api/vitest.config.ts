import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { testEnv } from './test/test-env';

// O esbuild do Vite não emite metadados de decorators; o Nest precisa deles para DI.
const plugins = [swc.vite({ module: { type: 'es6' } })];

/**
 * Dois projetos: `unit` (src/, sem banco) e `integration` (test/, com Postgres).
 * `vitest run --project unit` roda sem infraestrutura.
 */
export default defineConfig({
  plugins,
  test: {
    projects: [
      {
        plugins,
        test: { name: 'unit', env: testEnv, include: ['src/**/*.test.ts'] },
      },
      {
        plugins,
        test: {
          name: 'integration',
          env: testEnv,
          globalSetup: ['./test/global-setup.ts'],
          include: ['test/**/*.test.ts'],
          // Os testes de integração compartilham um banco; arquivos em sequência evitam disputa.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
