import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvRecords } from './csv';

describe('parseCsv', () => {
  it('detecta ; e lida com BOM, CRLF e linhas vazias', () => {
    expect(parseCsv('\uFEFFa;b\r\n1;2\r\n\r\n3;4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('detecta , e respeita aspas, aspas escapadas e quebra de linha dentro de aspas', () => {
    expect(parseCsv('a,b\n"0,5","diz ""oi""\nfim"')).toEqual([
      ['a', 'b'],
      ['0,5', 'diz "oi"\nfim'],
    ]);
  });

  it('mantém campos vazios', () => {
    expect(parseCsv('a;b;c\n;x;')).toEqual([
      ['a', 'b', 'c'],
      ['', 'x', ''],
    ]);
  });

  it('recusa aspas não fechadas', () => {
    expect(() => parseCsv('a\n"aberto')).toThrow(/aspas/);
  });
});

describe('parseCsvRecords', () => {
  it('normaliza o cabeçalho (minúsculas, sem acento, espaços viram _)', () => {
    expect(parseCsvRecords('Bloco;Número;Fração Ideal\nTorre A; 101 ;0,01')).toEqual([
      { bloco: 'Torre A', numero: '101', fracao_ideal: '0,01' },
    ]);
  });
});
