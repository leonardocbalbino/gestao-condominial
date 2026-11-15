import { describe, expect, it } from 'vitest';
import { SecretBox, sha256Hex } from './crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('SecretBox', () => {
  it('cifra e decifra', () => {
    const box = new SecretBox(KEY);
    const sealed = box.encrypt('segredo');
    expect(sealed).not.toContain('segredo');
    expect(box.decrypt(sealed)).toBe('segredo');
  });

  it('usa IV aleatório (mesmo texto gera cifras diferentes)', () => {
    const box = new SecretBox(KEY);
    expect(box.encrypt('x')).not.toBe(box.encrypt('x'));
  });

  it('detecta adulteração', () => {
    const box = new SecretBox(KEY);
    const [version, data] = box.encrypt('segredo').split('.');
    const bytes = Buffer.from(data ?? '', 'base64url');
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
    expect(() => box.decrypt(`${version}.${bytes.toString('base64url')}`)).toThrow();
  });

  it('rejeita chave com tamanho errado', () => {
    expect(() => new SecretBox(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('sha256Hex', () => {
  it('confere com vetor conhecido', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
