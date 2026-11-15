import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createCondominioRequestSchema,
  type CondominioDto,
  type CreateCondominioRequest,
} from '@condo/contracts';
import { RequirePermission } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { CondominioService } from './condominio.service';

@Controller('condominios')
export class CondominioController {
  constructor(private readonly condominios: CondominioService) {}

  @Post()
  @RequirePermission('condominio:create')
  create(
    @Body(new ZodPipe(createCondominioRequestSchema)) body: CreateCondominioRequest,
  ): Promise<CondominioDto> {
    return this.condominios.create(body);
  }

  /** Gestora vê todos; síndico/conselheiro veem só os condomínios do seu escopo. */
  @Get()
  @RequirePermission('condominio:read', { type: 'any' })
  list(): Promise<CondominioDto[]> {
    return this.condominios.listAccessible();
  }

  @Get(':id')
  @RequirePermission('condominio:read', { type: 'condominio', param: 'id' })
  get(@Param('id') id: string): Promise<CondominioDto> {
    return this.condominios.get(id);
  }
}
