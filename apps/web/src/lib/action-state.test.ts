import { describe, expect, it } from 'vitest';
import { optional, text } from './action-state';

describe('leitura de formulário', () => {
  it('apara espaços e trata campo vazio como ausente', () => {
    const form = new FormData();
    form.set('nome', '  Maria  ');
    form.set('cpf', '   ');
    expect(text(form, 'nome')).toBe('Maria');
    expect(optional(form, 'cpf')).toBeUndefined();
    expect(text(form, 'inexistente')).toBe('');
  });

  it('arquivo não é lido como texto', () => {
    const form = new FormData();
    form.set('arquivo', new Blob(['x']), 'a.csv');
    expect(text(form, 'arquivo')).toBe('');
  });
});
