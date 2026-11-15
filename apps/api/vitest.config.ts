import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { testEnv } from './test/test-env';

export default defineConfig({
  // O esbuild do Vite não emite metadados de decorators; o Nest precisa deles para DI.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    env: testEnv,
    globalSetup: ['./test/global-setup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Os testes de integração compartilham um banco; arquivos em sequência evitam disputa.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
