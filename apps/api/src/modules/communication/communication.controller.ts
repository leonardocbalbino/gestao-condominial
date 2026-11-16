import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createAnnouncementRequestSchema,
  type AnnouncementDto,
  type AnnouncementStatsDto,
  type CreateAnnouncementRequest,
  type MoradorHomeDto,
} from '@condo/contracts';
import { RequirePermission } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { AnnouncementService } from './announcement.service';
import { HomeService } from './home.service';

const CONDO = { type: 'condominio', param: 'condominioId' } as const;
const UNIT = { type: 'unit', condominioParam: 'condominioId', unitParam: 'unitId' } as const;

@Controller('condominios/:condominioId')
export class CommunicationController {
  constructor(
    private readonly announcements: AnnouncementService,
    private readonly home: HomeService,
  ) {}

  @Post('announcements')
  @RequirePermission('comunicado:publish', CONDO)
  publish(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(createAnnouncementRequestSchema)) body: CreateAnnouncementRequest,
  ): Promise<AnnouncementDto> {
    return this.announcements.publish(condominioId, body);
  }

  @Get('announcements')
  @RequirePermission('comunicado:publish', CONDO)
  list(@Param('condominioId') condominioId: string): Promise<AnnouncementStatsDto[]> {
    return this.announcements.listWithStats(condominioId);
  }

  /** Comunicados para o morador, pelo escopo da unidade dele. */
  @Get('units/:unitId/announcements')
  @RequirePermission('comunicado:read', UNIT)
  forUnit(@Param('condominioId') condominioId: string): Promise<AnnouncementDto[]> {
    return this.announcements.listForCurrentUser(condominioId);
  }

  @Post('units/:unitId/announcements/:announcementId/read')
  @RequirePermission('comunicado:read', UNIT)
  markRead(
    @Param('condominioId') condominioId: string,
    @Param('announcementId') announcementId: string,
  ): Promise<AnnouncementDto> {
    return this.announcements.markRead(condominioId, announcementId);
  }

  /** Tela inicial do morador: pendência → comunicados não lidos → avisos do dia. */
  @Get('units/:unitId/home')
  @RequirePermission('unidade:read', UNIT)
  homeOf(
    @Param('condominioId') condominioId: string,
    @Param('unitId') unitId: string,
  ): Promise<MoradorHomeDto> {
    return this.home.forUnit(condominioId, unitId);
  }
}
