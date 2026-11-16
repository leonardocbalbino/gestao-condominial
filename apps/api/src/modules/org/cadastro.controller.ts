import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createBlockRequestSchema,
  createPersonRequestSchema,
  createUnitRequestSchema,
  createVehicleRequestSchema,
  generateBlockRequestSchema,
  importUnitsRequestSchema,
  updateUnitRequestSchema,
  type BlockDto,
  type CreateBlockRequest,
  type CreatePersonRequest,
  type CreateUnitRequest,
  type CreateVehicleRequest,
  type GenerateBlockRequest,
  type ImportUnitsRequest,
  type ImportUnitsResult,
  type PersonDto,
  type UnitDto,
  type UpdateUnitRequest,
  type VehicleDto,
} from '@condo/contracts';
import { RequirePermission } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { BlockService } from './block.service';
import { PersonService } from './person.service';
import { UnitService } from './unit.service';
import { VehicleService } from './vehicle.service';

const CONDO = { type: 'condominio', param: 'condominioId' } as const;
const UNIT = { type: 'unit', condominioParam: 'condominioId', unitParam: 'unitId' } as const;

@Controller('condominios/:condominioId')
export class CadastroController {
  constructor(
    private readonly blocks: BlockService,
    private readonly units: UnitService,
    private readonly vehicles: VehicleService,
  ) {}

  @Get('blocks')
  @RequirePermission('unidade:read', CONDO)
  listBlocks(@Param('condominioId') condominioId: string): Promise<BlockDto[]> {
    return this.blocks.list(condominioId);
  }

  @Post('blocks')
  @RequirePermission('unidade:manage', CONDO)
  createBlock(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(createBlockRequestSchema)) body: CreateBlockRequest,
  ): Promise<BlockDto> {
    return this.blocks.create(condominioId, body);
  }

  @Post('blocks/generate')
  @RequirePermission('unidade:manage', CONDO)
  generate(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(generateBlockRequestSchema)) body: GenerateBlockRequest,
  ): Promise<UnitDto[]> {
    return this.units.generate(condominioId, body);
  }

  @Get('units')
  @RequirePermission('unidade:read', CONDO)
  listUnits(@Param('condominioId') condominioId: string): Promise<UnitDto[]> {
    return this.units.list(condominioId);
  }

  @Post('units')
  @RequirePermission('unidade:manage', CONDO)
  createUnit(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(createUnitRequestSchema)) body: CreateUnitRequest,
  ): Promise<UnitDto> {
    return this.units.create(condominioId, body);
  }

  @Post('units/import')
  @RequirePermission('unidade:manage', CONDO)
  importUnits(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(importUnitsRequestSchema)) body: ImportUnitsRequest,
  ): Promise<ImportUnitsResult> {
    return this.units.importCsv(condominioId, body.csv);
  }

  /** Staff vê qualquer unidade do condomínio; o morador, só a própria (escopo da unidade). */
  @Get('units/:unitId')
  @RequirePermission('unidade:read', UNIT)
  getUnit(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
  ): Promise<UnitDto> {
    return this.units.get(condominioId, unitId);
  }

  @Patch('units/:unitId')
  @RequirePermission('unidade:manage', UNIT)
  updateUnit(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodPipe(updateUnitRequestSchema)) body: UpdateUnitRequest,
  ): Promise<UnitDto> {
    return this.units.update(condominioId, unitId, body);
  }

  @Get('units/:unitId/vehicles')
  @RequirePermission('unidade:read', UNIT)
  listVehicles(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
  ): Promise<VehicleDto[]> {
    return this.vehicles.list(condominioId, unitId);
  }

  @Post('units/:unitId/vehicles')
  @RequirePermission('unidade:manage', UNIT)
  createVehicle(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
    @Body(new ZodPipe(createVehicleRequestSchema)) body: CreateVehicleRequest,
  ): Promise<VehicleDto> {
    return this.vehicles.create(condominioId, unitId, body);
  }

  @Delete('units/:unitId/vehicles/:vehicleId')
  @HttpCode(204)
  @RequirePermission('unidade:manage', UNIT)
  removeVehicle(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
    @Param('vehicleId') vehicleId: string,
  ): Promise<void> {
    return this.vehicles.remove(condominioId, unitId, vehicleId);
  }
}

/** Cadastro de pessoas é da gestora (uma pessoa pode ter unidades em vários condomínios). */
@Controller('persons')
export class PersonController {
  constructor(private readonly persons: PersonService) {}

  @Get()
  @RequirePermission('pessoa:read')
  list(): Promise<PersonDto[]> {
    return this.persons.list();
  }

  @Post()
  @RequirePermission('pessoa:manage')
  create(
    @Body(new ZodPipe(createPersonRequestSchema)) body: CreatePersonRequest,
  ): Promise<PersonDto> {
    return this.persons.create(body);
  }
}
