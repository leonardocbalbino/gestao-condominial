import { Injectable } from '@nestjs/common';
import { daysBetween, type MoradorHomeDto, type MyChargeDto } from '@condo/contracts';
import { todayInBrazil } from '../../common/dates';
import { ChargeService } from '../billing/charge.service';
import { CondominioService } from '../org/condominio.service';
import { describeUnit, UnitService } from '../org/unit.service';
import { AnnouncementService } from './announcement.service';

/** A pendência aparece quando a taxa está em atraso ou vence nos próximos dias. */
const AVISO_VENCIMENTO_DIAS = 15;

/**
 * Pendência a destacar: a mais antiga em atraso; senão, a próxima a vencer dentro do
 * prazo de aviso. Pagas e canceladas nunca entram.
 */
export function pickPendencia(charges: MyChargeDto[], hoje: string): MyChargeDto | null {
  const abertas = charges.filter((c) => c.status !== 'paga' && c.status !== 'cancelada');
  const atrasadas = abertas
    .filter((c) => c.atrasada)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  if (atrasadas[0]) return atrasadas[0];
  const proximas = abertas
    .filter((c) => daysBetween(hoje, c.vencimento) <= AVISO_VENCIMENTO_DIAS)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return proximas[0] ?? null;
}

@Injectable()
export class HomeService {
  constructor(
    private readonly charges: ChargeService,
    private readonly announcements: AnnouncementService,
    private readonly units: UnitService,
    private readonly condominios: CondominioService,
  ) {}

  async forUnit(condominioId: string, unitId: string): Promise<MoradorHomeDto> {
    const unit = await this.units.get(condominioId, unitId);
    const condominio = await this.condominios.get(condominioId);
    const charges = await this.charges.ofUnit(condominioId, unitId);
    const announcements = await this.announcements.listForCurrentUser(condominioId);
    return {
      condominioNome: condominio.nome,
      unidade: describeUnit(unit),
      pendencia: pickPendencia(charges, todayInBrazil()),
      comunicadosNaoLidos: announcements.filter((a) => !a.lido),
      avisosDoDia: [],
    };
  }
}
