import base from '@condo/config/eslint';

export default [
  ...base,
  {
    // Nest usa classes vazias como módulos e injeta dependências por tipo.
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
