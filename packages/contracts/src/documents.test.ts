import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpj, isValidCpf } from './documents';

describe('isValidCpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['529.982.247-24', '111.111.111-11', '123', ''])('rejeita %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });
});

describe('isValidCnpj', () => {
  it.each(['11.222.333/0001-81', '11222333000181'])('aceita %s', (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true);
  });

  it.each(['11.222.333/0001-80', '00.000.000/0000-00', '1122233300018'])('rejeita %s', (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(false);
  });
});

describe('formatCnpj', () => {
  it.each([
    ['11222333000181', '11.222.333/0001-81'],
    ['11.222.333/0001-81', '11.222.333/0001-81'],
    ['1122', '11.22'],
    ['112223330', '11.222.333/0'],
    ['1122233300018199', '11.222.333/0001-81'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(formatCnpj(input)).toBe(expected);
  });
});
