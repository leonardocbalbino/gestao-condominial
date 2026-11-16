import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { RateioPreviewDto, RateioRequest } from '@condo/contracts';
import { firstDayOf } from '../../common/dates';
import { isUniqueViolation } from '../../db/errors';
import { currentContext } from '../../db/request-context';
import { charge, chargeItem } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { UnitAccessService } from '../identity/unit-access.service';
import { AccountService } from '../ledger/account.service';
import { CondominioService } from '../org/condominio.service';
import { PersonService } from '../org/person.service';
import { describeUnit, UnitService } from '../org/unit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { BudgetService } from './budget.service';
import { PaymentAccountService } from './payment-account.service';
import { computeRateio } from './rateio';

export const CHARGE_EMIT_TOPIC = 'charge.emit';

interface Plan {
  preview: RateioPreviewDto;
  payers: Map<string, string>;
  multaBp: number;
  jurosMensalBp: number;
}

/**
 * Rateio mensal: orçamento aprovado do ano → taxa por unidade (critério de cada linha,
 * sobra de centavos pelo maior resto) + fundo de reserva (% sobre a taxa).
 * A emissão é tudo ou nada: com qualquer pendência, nenhuma cobrança é criada.
 */
@Injectable()
export class RateioService {
  constructor(
    private readonly budgets: BudgetService,
    private readonly units: UnitService,
    private readonly condominios: CondominioService,
    private readonly accounts: AccountService,
    private readonly grants: UnitAccessService,
    private readonly persons: PersonService,
    private readonly paymentAccounts: PaymentAccountService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async preview(condominioId: string, input: RateioRequest): Promise<RateioPreviewDto> {
    return (await this.plan(condominioId, input)).preview;
  }

  async emit(condominioId: string, input: RateioRequest): Promise<{ cobrancas: number }> {
    const { preview, payers, multaBp, jurosMensalBp } = await this.plan(condominioId, input);
    if (preview.pendencias.length > 0) {
      throw new BadRequestException({
        message: 'Resolva as pendências antes de emitir',
        pendencias: preview.pendencias,
      });
    }
    await this.paymentAccounts.get(condominioId); // exige conta no broker
    const taxa = await this.accounts.byPapel(condominioId, 'taxa_ordinaria');
    const fundo = await this.accounts.byPapel(condominioId, 'fundo_reserva');

    const { tx, gestoraId, userId } = currentContext();
    if (!gestoraId) throw new Error('Rateio exige gestora em contexto');
    const competencia = firstDayOf(preview.competencia);
    let created: { id: string; unitId: string }[];
    try {
      created = await tx
        .insert(charge)
        .values(
          preview.unidades.map((u) => ({
            gestoraId,
            condominioId,
            unitId: u.unitId,
            competencia,
            vencimento: preview.vencimento,
            valorCentavos: u.totalCentavos,
            multaBp,
            jurosMensalBp,
            pagadorPersonId: payers.get(u.unitId) ?? null,
            createdBy: userId,
          })),
        )
        .returning({ id: charge.id, unitId: charge.unitId });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`A taxa de ${preview.competencia} já foi emitida`);
      }
      throw error;
    }

    const byUnit = new Map(preview.unidades.map((u) => [u.unitId, u]));
    const items = created.flatMap((c) => {
      const u = byUnit.get(c.unitId);
      if (!u) return [];
      return [
        {
          chargeId: c.id,
          accountId: taxa.id,
          descricao: 'Taxa condominial',
          valorCentavos: u.taxaCentavos,
        },
        {
          chargeId: c.id,
          accountId: fundo.id,
          descricao: 'Fundo de reserva',
          valorCentavos: u.fundoReservaCentavos,
        },
      ].filter((i) => i.valorCentavos > 0);
    });
    await tx.insert(chargeItem).values(items.map((i) => ({ ...i, gestoraId, condominioId })));

    for (const c of created) {
      await this.outbox.enqueue(CHARGE_EMIT_TOPIC, { chargeId: c.id }, condominioId);
    }
    const result = { cobrancas: created.length };
    await this.audit.record({
      action: 'rateio.emitted',
      resourceType: 'condominio',
      resourceId: condominioId,
      after: {
        competencia: preview.competencia,
        vencimento: preview.vencimento,
        totalCentavos: preview.totalCentavos,
        ...result,
      },
    });
    return result;
  }

  private async plan(condominioId: string, input: RateioRequest): Promise<Plan> {
    const config = await this.condominios.getConfig(condominioId);
    const competencia = input.competencia;
    const vencimento =
      input.vencimento ??
      `${competencia}-${String(config.cobranca.diaVencimento).padStart(2, '0')}`;
    const budget = await this.budgets.approvedFor(condominioId, Number(competencia.slice(0, 4)));
    const units = await this.units.list(condominioId);
    const payers = await this.grants.payersOf(condominioId);
    const people = await this.persons.billingData([...new Set(payers.values())]);

    const pendencias: string[] = [];
    let shares: ReturnType<typeof computeRateio> = [];
    try {
      shares = computeRateio(
        units.map((u) => ({ id: u.id, fracaoIdeal: u.fracaoIdeal })),
        budget.linhas.map((l) => ({ valorCentavos: l.valorMensalCentavos, criterio: l.criterio })),
        config.cobranca.fundoReservaBp,
      );
    } catch (error) {
      pendencias.push((error as Error).message);
    }

    const unidades = units.map((u, i) => {
      const share = shares[i];
      const personId = payers.get(u.id);
      const pagador = personId ? people.get(personId) : undefined;
      const unidade = describeUnit(u);
      if (!pagador) pendencias.push(`${unidade}: sem proprietário com acesso de pagamento`);
      else if (!pagador.cpf) pendencias.push(`${unidade}: pagador sem CPF cadastrado`);
      const taxaCentavos = share?.taxaCentavos ?? 0;
      const fundoReservaCentavos = share?.fundoReservaCentavos ?? 0;
      return {
        unitId: u.id,
        unidade,
        taxaCentavos,
        fundoReservaCentavos,
        totalCentavos: taxaCentavos + fundoReservaCentavos,
        pagador: pagador?.nome ?? null,
      };
    });
    if (unidades.some((u) => u.totalCentavos <= 0) && shares.length > 0) {
      pendencias.push('Há unidades com valor zero no rateio');
    }

    return {
      preview: {
        competencia,
        vencimento,
        totalCentavos: unidades.reduce((acc, u) => acc + u.totalCentavos, 0),
        unidades,
        pendencias,
      },
      payers,
      multaBp: config.cobranca.multaBp,
      jurosMensalBp: config.cobranca.jurosMensalBp,
    };
  }
}
