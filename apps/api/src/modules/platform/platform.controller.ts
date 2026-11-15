import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  createGestoraRequestSchema,
  type CreateGestoraRequest,
  type GestoraDto,
} from '@condo/contracts';
import { PlatformAdmin } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { PlatformService } from './platform.service';

@Controller('platform')
@PlatformAdmin()
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post('gestoras')
  createGestora(
    @Body(new ZodPipe(createGestoraRequestSchema)) body: CreateGestoraRequest,
  ): Promise<GestoraDto> {
    return this.platform.createGestora(body);
  }

  @Get('gestoras')
  listGestoras(): Promise<GestoraDto[]> {
    return this.platform.listGestoras();
  }
}
