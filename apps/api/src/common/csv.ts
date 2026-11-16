/**
 * Parser CSV mínimo (RFC 4180): campos entre aspas, aspas escapadas ("") e quebras de
 * linha dentro de aspas. O separador é detectado no cabeçalho: `;` (padrão do Excel em
 * português) ou `,`. Remove BOM e ignora linhas vazias.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = count(firstLine, ';') >= count(firstLine, ',') ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV inválido: aspas não fechadas');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Linhas como objetos indexados pelo cabeçalho normalizado (minúsculas, sem acento). */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map(normalizeHeader);
  return rows.map((cells) =>
    Object.fromEntries(keys.map((key, i) => [key, (cells[i] ?? '').trim()])),
  );
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function count(text: string, ch: string): number {
  return text.split(ch).length - 1;
}
