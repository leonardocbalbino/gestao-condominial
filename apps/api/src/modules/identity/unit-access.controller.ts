import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { createOwnerGrantRequestSchema, type CreateOwnerGrantRequest } from '@condo/contracts';
import { RequirePermission } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { UnitAccessService, type UnitGrantWithPerson } from './unit-access.service';

const UNIT = { type: 'unit', condominioParam: 'condominioId', unitParam: 'unitId' } as const;

/** Quem tem acesso à unidade. Gestora e síndico cadastram (matriz §9: convidar moradores). */
@Controller('condominios/:condominioId/units/:unitId/grants')
export class UnitAccessController {
  constructor(private readonly grants: UnitAccessService) {}

  @Get()
  @RequirePermission('pessoa:read', UNIT)
  list(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
  ): Promise<UnitGrantWithPerson[]> {
    return this.grants.list(condominioId, unitId);
  }

  @Post('owner')
  @RequirePermission('pessoa:manage', UNIT)
  addOwner(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodPipe(createOwnerGrantRequestSchema)) body: CreateOwnerGrantRequest,
  ): Promise<UnitGrantWithPerson> {
    return this.grants.addOwner(condominioId, unitId, body);
  }

  @Delete(':grantId')
  @HttpCode(204)
  @RequirePermission('pessoa:manage', UNIT)
  revoke(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
    @Param('grantId') grantId: string,
  ): Promise<void> {
    return this.grants.revoke(condominioId, unitId, grantId);
  }
}
