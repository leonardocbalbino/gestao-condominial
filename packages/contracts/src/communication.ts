import { z } from 'zod';
import type { MyChargeDto } from './billing';

export const createAnnouncementRequestSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  corpo: z.string().trim().min(3).max(5000),
});
export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;

export interface AnnouncementDto {
  id: string;
  titulo: string;
  corpo: string;
  publicadoEm: string;
  /** Para quem está vendo: já confirmou "Li e entendi"? */
  lido: boolean;
}

/** Para a gestora/síndico: quantas pessoas confirmaram a leitura. */
export interface AnnouncementStatsDto extends AnnouncementDto {
  confirmacoes: number;
}

/**
 * Tela inicial do morador, na ordem do §7: pendência financeira → comunicados não lidos →
 * avisos do dia. Os atalhos (cards) são montados pelo app a partir dos módulos ligados.
 */
export interface MoradorHomeDto {
  condominioNome: string;
  unidade: string;
  /** Boleto em atraso ou o próximo a vencer. Nunca pode ser ocultado. */
  pendencia: MyChargeDto | null;
  comunicadosNaoLidos: AnnouncementDto[];
  /** Visitas, encomendas e reservas do dia (módulos da Fase 3). */
  avisosDoDia: { tipo: string; texto: string }[];
}
