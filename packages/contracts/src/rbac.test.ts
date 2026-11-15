import { describe, expect, it } from 'vitest';
import { createRoleRequestSchema } from './rbac';

describe('createRoleRequestSchema', () => {
  it('remove permissões duplicadas', () => {
    const parsed = createRoleRequestSchema.parse({
      key: 'assistente_financeiro',
      name: 'Assistente financeiro',
      requiresMfa: true,
      permissions: ['condominio:read', 'condominio:read'],
    });
    expect(parsed.permissions).toEqual(['condominio:read']);
  });

  it('rejeita permissão fora do catálogo', () => {
    const result = createRoleRequestSchema.safeParse({
      key: 'zelador',
      name: 'Zelador',
      requiresMfa: false,
      permissions: ['ledger:delete_everything'],
    });
    expect(result.success).toBe(false);
  });
});
