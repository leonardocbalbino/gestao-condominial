import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, totpCode, verifyTotp } from './totp';

// Segredo dos vetores de teste da RFC 6238 (apêndice B), SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('t=%i gera %s (8 dígitos)', (seconds, expected) => {
    const key = base32Decode(RFC_SECRET);
    expect(hotp(key, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it('gera os 6 últimos dígitos no formato dos apps autenticadores', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082');
  });

  it('aceita ±1 passo e devolve o passo usado', () => {
    const now = 1_234_567_890_000;
    const previous = totpCode(RFC_SECRET, now - 30_000);
    expect(verifyTotp(RFC_SECRET, previous, now)).toBe(Math.floor(now / 30_000) - 1);
  });

  it('rejeita código fora da janela e formato inválido', () => {
    const now = 1_234_567_890_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abc123', now)).toBeNull();
  });

  it('base32 faz ida e volta', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });
});
