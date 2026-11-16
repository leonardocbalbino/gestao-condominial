import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createUnitRequestSchema,
  type CreateUnitRequest,
  type GenerateBlockRequest,
  type ImportUnitsResult,
  type UnitDto,
  type UpdateUnitRequest,
} from '@condo/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { parseCsvRecords } from '../../common/csv';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { block, unit } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { BlockService } from './block.service';
import { CondominioService } from './condominio.service';

type UnitRow = typeof unit.$inferSelect;
type NewUnit = Omit<CreateUnitRequest, 'blockId'> & { blockId?: string | undefined };

const toDto = (row: UnitRow, blockNome: string | null): UnitDto => ({
  id: row.id,
  condominioId: row.condominioId,
  blockId: row.blockId,
  blockNome,
  andar: row.andar,
  numero: row.numero,
  tipo: row.tipo,
  fracaoIdeal: row.fracaoIdeal,
});

/** Descrição curta para listas e boletos: "Torre A · 101" ou "Casa 12". */
export const describeUnit = (u: Pick<UnitDto, 'blockNome' | 'numero'>): string =>
  u.blockNome ? `${u.blockNome} · ${u.numero}` : u.numero;

const MAX_IMPORT_ROWS = 5_000;

@Injectable()
export class UnitService {
  constructor(
    private readonly condominios: CondominioService,
    private readonly blocks: BlockService,
    private readonly audit: AuditService,
  ) {}

  async list(condominioId: string): Promise<UnitDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select({ unit, blockNome: block.nome })
      .from(unit)
      .leftJoin(block, eq(block.id, unit.blockId))
      .where(eq(unit.condominioId, condominioId))
      .orderBy(
        asc(block.nome),
        sql`${unit.andar} NULLS FIRST`,
        sql`length(${unit.numero})`,
        asc(unit.numero),
      );
    return rows.map((r) => toDto(r.unit, r.blockNome));
  }

  async get(condominioId: string, unitId: string): Promise<UnitDto> {
    const { tx } = currentContext();
    const [row] = await tx
      .select({ unit, blockNome: block.nome })
      .from(unit)
      .leftJoin(block, eq(block.id, unit.blockId))
      .where(and(eq(unit.id, unitId), eq(unit.condominioId, condominioId)));
    if (!row) throw new NotFoundException('Unidade não encontrada');
    return toDto(row.unit, row.blockNome);
  }

  async create(condominioId: string, input: CreateUnitRequest): Promise<UnitDto> {
    await this.condominios.assertExists(condominioId);
    const blockNome = input.blockId
      ? (await this.blocks.get(condominioId, input.blockId)).nome
      : null;
    const [row] = await this.insertMany(condominioId, [input]);
    if (!row) throw new Error('Falha ao criar unidade');
    const dto = toDto(row, blockNome);
    await this.audit.record({
      action: 'unit.created',
      resourceType: 'unit',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  async update(condominioId: string, unitId: string, input: UpdateUnitRequest): Promise<UnitDto> {
    const before = await this.get(condominioId, unitId);
    const { tx } = currentContext();
    const [row] = await tx
      .update(unit)
      .set({
        ...(input.tipo ? { tipo: input.tipo } : {}),
        ...(input.fracaoIdeal !== undefined ? { fracaoIdeal: input.fracaoIdeal } : {}),
      })
      .where(and(eq(unit.id, unitId), eq(unit.condominioId, condominioId)))
      .returning();
    if (!row) throw new NotFoundException('Unidade não encontrada');
    const after = toDto(row, before.blockNome);
    await this.audit.record({
      action: 'unit.updated',
      resourceType: 'unit',
      resourceId: unitId,
      before,
      after,
    });
    return after;
  }

  /** "Torre A, 10 andares, 4 por andar" → bloco + 40 unidades (101…1004). */
  async generate(condominioId: string, input: GenerateBlockRequest): Promise<UnitDto[]> {
    const created = await this.blocks.insert(condominioId, {
      nome: input.nome,
      andares: input.andares,
    });
    const units: NewUnit[] = [];
    for (let i = 0; i < input.andares; i++) {
      const andar = input.andarInicial + i;
      for (let pos = 1; pos <= input.unidadesPorAndar; pos++) {
        units.push({
          blockId: created.id,
          andar,
          numero: `${andar}${String(pos).padStart(2, '0')}`,
          tipo: input.tipo,
          fracaoIdeal: input.fracaoIdeal,
        });
      }
    }
    const rows = await this.insertMany(condominioId, units);
    const dtos = rows.map((r) => toDto(r, created.nome));
    await this.audit.record({
      action: 'block.generated',
      resourceType: 'block',
      resourceId: created.id,
      after: { block: created, ...input, unidades: dtos.length },
    });
    return dtos;
  }

  /** Importação CSV tudo-ou-nada; erros de linha voltam juntos, com o número da linha. */
  async importCsv(condominioId: string, csv: string): Promise<ImportUnitsResult> {
    await this.condominios.assertExists(condominioId);
    let records: Record<string, string>[];
    try {
      records = parseCsvRecords(csv);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (records.length === 0) throw new BadRequestException('O arquivo não tem unidades');
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Importe no máximo ${MAX_IMPORT_ROWS} unidades por vez`);
    }

    const issues: { linha: number; erro: string }[] = [];
    const parsed: { bloco: string; unit: Omit<NewUnit, 'blockId'> }[] = [];
    records.forEach((record, i) => {
      const linha = i + 2; // linha 1 é o cabeçalho
      const andar = record['andar'] ?? '';
      const result = createUnitRequestSchema.omit({ blockId: true }).safeParse({
        numero: record['numero'],
        tipo: record['tipo'] || undefined,
        andar: andar === '' ? undefined : Number(andar),
        fracaoIdeal: record['fracao_ideal'] || undefined,
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ linha, erro: `${issue.path.join('.')}: ${issue.message}` });
        }
        return;
      }
      parsed.push({ bloco: record['bloco'] ?? '', unit: result.data });
    });
    if (issues.length > 0) {
      throw new BadRequestException({ message: 'Há linhas inválidas no arquivo', issues });
    }

    const existing = new Map(
      (await this.blocks.list(condominioId)).map((b) => [b.nome.toLowerCase(), b.id]),
    );
    let blocosCriados = 0;
    const units: NewUnit[] = [];
    for (const { bloco, unit: u } of parsed) {
      let blockId: string | undefined;
      if (bloco) {
        blockId = existing.get(bloco.toLowerCase());
        if (!blockId) {
          blockId = (await this.blocks.insert(condominioId, { nome: bloco })).id;
          existing.set(bloco.toLowerCase(), blockId);
          blocosCriados++;
        }
      }
      units.push({ ...u, blockId });
    }
    const rows = await this.insertMany(condominioId, units);
    const result = { blocosCriados, unidadesCriadas: rows.length };
    await this.audit.record({
      action: 'unit.imported',
      resourceType: 'condominio',
      resourceId: condominioId,
      after: result,
    });
    return result;
  }

  private async insertMany(condominioId: string, units: NewUnit[]): Promise<UnitRow[]> {
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Cadastro de unidade exige gestora em contexto');
    try {
      return await tx
        .insert(unit)
        .values(
          units.map((u) => ({
            gestoraId,
            condominioId,
            blockId: u.blockId ?? null,
            andar: u.andar ?? null,
            numero: u.numero,
            tipo: u.tipo,
            fracaoIdeal: u.fracaoIdeal ?? null,
          })),
        )
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe unidade com este número no mesmo bloco');
      }
      throw error;
    }
  }
}
