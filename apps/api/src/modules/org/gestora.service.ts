import { ConflictException, Injectable } from '@nestjs/common';
import type { Branding, GestoraDto } from '@condo/contracts';
import { asc, inArray } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { gestora } from '../../db/schema';

const toDto = (row: typeof gestora.$inferSelect): GestoraDto => ({
  id: row.id,
  nome: row.nome,
  cnpj: row.cnpj,
  branding: row.branding as Branding,
});

@Injectable()
export class GestoraService {
  /** Só o caminho de plataforma tem permissão de INSERT em `gestora`. */
  async create(input: { nome: string; cnpj: string; branding: Branding }): Promise<GestoraDto> {
    const { tx } = currentContext();
    try {
      const [row] = await tx.insert(gestora).values(input).returning();
      if (!row) throw new Error('Falha ao criar gestora');
      return toDto(row);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Já existe uma gestora com este CNPJ');
      throw error;
    }
  }

  /** Lista as gestoras visíveis pela conexão atual (todas, no caminho de plataforma). */
  async list(): Promise<GestoraDto[]> {
    const { tx } = currentContext();
    const rows = await tx.select().from(gestora).orderBy(asc(gestora.nome));
    return rows.map(toDto);
  }

  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const { tx } = currentContext();
    const rows = await tx
      .select({ id: gestora.id, nome: gestora.nome })
      .from(gestora)
      .where(inArray(gestora.id, ids));
    return new Map(rows.map((r) => [r.id, r.nome]));
  }
}
