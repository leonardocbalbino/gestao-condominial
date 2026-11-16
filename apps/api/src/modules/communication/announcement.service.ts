import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AnnouncementDto,
  AnnouncementStatsDto,
  CreateAnnouncementRequest,
} from '@condo/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import { currentContext } from '../../db/request-context';
import { announcement, announcementRead } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { CondominioService } from '../org/condominio.service';

type AnnouncementRow = typeof announcement.$inferSelect;

const toDto = (row: AnnouncementRow, lido: boolean): AnnouncementDto => ({
  id: row.id,
  titulo: row.titulo,
  corpo: row.corpo,
  publicadoEm: row.publicadoEm.toISOString(),
  lido,
});

/** Comunicados do condomínio e a confirmação de leitura de cada pessoa. */
@Injectable()
export class AnnouncementService {
  constructor(
    private readonly condominios: CondominioService,
    private readonly audit: AuditService,
  ) {}

  async publish(condominioId: string, input: CreateAnnouncementRequest): Promise<AnnouncementDto> {
    await this.condominios.assertExists(condominioId);
    const { tx, gestoraId, userId } = currentContext();
    if (!gestoraId) throw new Error('Comunicado exige gestora em contexto');
    const [row] = await tx
      .insert(announcement)
      .values({
        gestoraId,
        condominioId,
        titulo: input.titulo,
        corpo: input.corpo,
        publicadoPor: userId,
      })
      .returning();
    if (!row) throw new Error('Falha ao publicar comunicado');
    const dto = toDto(row, false);
    await this.audit.record({
      action: 'announcement.published',
      resourceType: 'announcement',
      resourceId: dto.id,
      after: { titulo: dto.titulo },
    });
    return dto;
  }

  /** Visão da gestora/síndico: com o número de confirmações de leitura. */
  async listWithStats(condominioId: string): Promise<AnnouncementStatsDto[]> {
    const { tx } = currentContext();
    const rows = await tx
      .select({
        a: announcement,
        confirmacoes: sql<number>`(SELECT count(*)::int FROM announcement_read r WHERE r.announcement_id = ${announcement.id})`,
      })
      .from(announcement)
      .where(eq(announcement.condominioId, condominioId))
      .orderBy(desc(announcement.publicadoEm));
    return rows.map((r) => ({ ...toDto(r.a, false), confirmacoes: r.confirmacoes }));
  }

  /** Visão de quem está logado: cada comunicado com "já li" ou não. */
  async listForCurrentUser(condominioId: string): Promise<AnnouncementDto[]> {
    const { tx, userId } = currentContext();
    if (!userId) throw new Error('Lista de comunicados exige usuário');
    const rows = await tx
      .select({ a: announcement, lidoEm: announcementRead.lidoEm })
      .from(announcement)
      .leftJoin(
        announcementRead,
        and(
          eq(announcementRead.announcementId, announcement.id),
          eq(announcementRead.userId, userId),
        ),
      )
      .where(eq(announcement.condominioId, condominioId))
      .orderBy(desc(announcement.publicadoEm));
    return rows.map((r) => toDto(r.a, r.lidoEm !== null));
  }

  /** "Li e entendi": registra uma vez; repetir não muda a data da primeira confirmação. */
  async markRead(condominioId: string, announcementId: string): Promise<AnnouncementDto> {
    const { tx, gestoraId, userId } = currentContext();
    if (!gestoraId || !userId) throw new Error('Confirmação exige usuário e gestora');
    const [row] = await tx
      .select()
      .from(announcement)
      .where(and(eq(announcement.id, announcementId), eq(announcement.condominioId, condominioId)));
    if (!row) throw new NotFoundException('Comunicado não encontrado');
    const [inserted] = await tx
      .insert(announcementRead)
      .values({ announcementId, userId, gestoraId, condominioId })
      .onConflictDoNothing()
      .returning();
    await this.audit.record({
      action: inserted ? 'announcement.read' : 'announcement.read_again',
      resourceType: 'announcement',
      resourceId: announcementId,
    });
    return toDto(row, true);
  }
}
