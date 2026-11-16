import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateVehicleRequest, VehicleDto } from '@condo/contracts';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { vehicle } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { UnitService } from './unit.service';

const toDto = (row: typeof vehicle.$inferSelect): VehicleDto => ({
  id: row.id,
  unitId: row.unitId,
  placa: row.placa,
  modelo: row.modelo,
  cor: row.cor,
});

@Injectable()
export class VehicleService {
  constructor(
    private readonly units: UnitService,
    private readonly audit: AuditService,
  ) {}

  async list(condominioId: string, unitId: string): Promise<VehicleDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select()
      .from(vehicle)
      .where(
        and(
          eq(vehicle.condominioId, condominioId),
          eq(vehicle.unitId, unitId),
          isNull(vehicle.removidoEm),
        ),
      )
      .orderBy(asc(vehicle.placa));
    return rows.map(toDto);
  }

  async create(
    condominioId: string,
    unitId: string,
    input: CreateVehicleRequest,
  ): Promise<VehicleDto> {
    await this.units.get(condominioId, unitId);
    const { tx, gestoraId } = currentContext();
    if (!gestoraId) throw new Error('Cadastro de veículo exige gestora em contexto');
    let row: typeof vehicle.$inferSelect | undefined;
    try {
      [row] = await tx
        .insert(vehicle)
        .values({
          gestoraId,
          condominioId,
          unitId,
          placa: input.placa,
          modelo: input.modelo ?? null,
          cor: input.cor ?? null,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Esta placa já está cadastrada no condomínio');
      }
      throw error;
    }
    if (!row) throw new Error('Falha ao cadastrar veículo');
    const dto = toDto(row);
    await this.audit.record({
      action: 'vehicle.created',
      resourceType: 'vehicle',
      resourceId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** Remoção lógica: o registro continua no histórico. */
  async remove(condominioId: string, unitId: string, vehicleId: string): Promise<void> {
    const { tx } = currentContext();
    const [row] = await tx
      .update(vehicle)
      .set({ removidoEm: sql`now()` })
      .where(
        and(
          eq(vehicle.id, vehicleId),
          eq(vehicle.condominioId, condominioId),
          eq(vehicle.unitId, unitId),
          isNull(vehicle.removidoEm),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException('Veículo não encontrado');
    await this.audit.record({
      action: 'vehicle.removed',
      resourceType: 'vehicle',
      resourceId: vehicleId,
      before: toDto(row),
    });
  }
}
