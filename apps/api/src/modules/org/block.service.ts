import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BlockDto, CreateBlockRequest } from '@condo/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { block } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { CondominioService } from './condominio.service';

type BlockRow = typeof block.$inferSelect;

export const toBlockDto = (row: BlockRow): BlockDto => ({
  id: row.id,
  condominioId: row.condominioId,
  nome: row.nome,
  andares: row.andares,
});

@Injectable()
export class BlockService {
  constructor(
    private readonly condominios: CondominioService,
    private readonly audit: AuditService,
  ) {}

  async list(condominioId: string): Promise<BlockDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(block)
      .where(eq(block.condominioId, condominioId))
      .orderBy(asc(block.nome));
    return rows.map(toBlockDto);
  }

  async get(condominioId: string, blockId: string): Promise<BlockDto> {
    const { tx } = currentContext();
    const [row] = await tx
      .select()
      .from(block)
      .where(and(eq(block.id, blockId), eq(block.condominioId, condominioId)));
    if (!row) throw new NotFoundException('Bloco não encontrado');
    return toBlockDto(row);
  }

  async create(condominioId: string, input: CreateBlockRequest): Promise<BlockDto> {
    const dto = await this.insert(condominioId, input);
    await this.audit.record({
      action: 'block.created',
      resourceType: 'block',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** Insere sem auditar: para quem audita a operação completa (geração, importação). */
  async insert(condominioId: string, input: CreateBlockRequest): Promise<BlockDto> {
    await this.condominios.assertExists(condominioId);
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Cadastro de bloco exige gestora em contexto');
    try {
      const [row] = await tx
        .insert(block)
        .values({ gestoraId, condominioId, nome: input.nome, andares: input.andares ?? null })
        .returning();
      if (!row) throw new Error('Falha ao criar bloco');
      return toBlockDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Já existe um bloco "${input.nome}" neste condomínio`);
      }
      throw error;
    }
  }
}
