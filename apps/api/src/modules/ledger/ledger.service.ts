import { Injectable } from '@nestjs/common';
import type {
  AccountGrupo,
  BalanceteDto,
  BalanceteLinha,
  PeriodDto,
  SetupLedgerRequest,
} from '@condo/contracts';
import { sql } from 'drizzle-orm';
import { currentContext } from '../../db/request-context';
import { AuditService } from '../audit/audit.service';
import { CondominioService } from '../org/condominio.service';
import { AccountService } from './account.service';
import { JournalService } from './journal.service';
import { firstDayOf, PeriodService, toPeriodDto } from './period.service';

// `type` (não interface) para satisfazer Record<string, unknown> exigido pelo execute().
type BalanceteRow = {
  account_id: string;
  codigo: string;
  nome: string;
  natureza: BalanceteLinha['natureza'];
  grupo: AccountGrupo | null;
  caixa: boolean;
  anterior: string;
  debitos: string;
  creditos: string;
};

/** Início da contabilidade e relatórios do razão. */
@Injectable()
export class LedgerService {
  constructor(
    private readonly condominios: CondominioService,
    private readonly accounts: AccountService,
    private readonly periods: PeriodService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  /** Copia o plano da gestora, abre o primeiro mês e lança o saldo inicial do banco. */
  async setup(condominioId: string, input: SetupLedgerRequest): Promise<PeriodDto> {
    await this.condominios.assertExists(condominioId);
    await this.accounts.copyTemplateTo(condominioId);
    const period = await this.periods.open(condominioId, input.mesInicial);
    if (input.saldoInicialCentavos > 0) {
      const banco = await this.accounts.byPapel(condominioId, 'banco');
      const saldo = await this.accounts.byPapel(condominioId, 'saldo_inicial');
      await this.journal.post(condominioId, {
        origem: 'saldo_inicial',
        dataCompetencia: period.mes,
        dataCaixa: period.mes,
        historico: 'Saldo inicial da conta do condomínio',
        linhas: [
          { accountId: banco.id, valorCentavos: input.saldoInicialCentavos },
          { accountId: saldo.id, valorCentavos: -input.saldoInicialCentavos },
        ],
      });
    }
    const dto = toPeriodDto(period);
    await this.audit.record({
      action: 'ledger.setup',
      resourceType: 'condominio',
      resourceId: condominioId,
      after: { primeiroPeriodo: dto, saldoInicialCentavos: input.saldoInicialCentavos },
    });
    return dto;
  }

  /** Balancete do mês: saldo anterior, débitos, créditos e saldo final por conta analítica. */
  async balancete(condominioId: string, periodId: string): Promise<BalanceteDto> {
    const period = await this.periods.get(condominioId, periodId);
    const { tx } = currentContext();
    const result = await tx.execute<BalanceteRow>(sql`
      SELECT a.id AS account_id, a.codigo, a.nome, a.natureza, a.grupo, a.caixa,
             coalesce(sum(l.valor_centavos) FILTER (WHERE p.mes < ${firstDayOf(period.mes)}::date), 0)::text AS anterior,
             coalesce(sum(l.valor_centavos) FILTER (WHERE p.id = ${periodId} AND l.valor_centavos > 0), 0)::text AS debitos,
             coalesce(-sum(l.valor_centavos) FILTER (WHERE p.id = ${periodId} AND l.valor_centavos < 0), 0)::text AS creditos
        FROM account a
        LEFT JOIN journal_line l ON l.account_id = a.id
        LEFT JOIN journal_entry e ON e.id = l.entry_id
        LEFT JOIN accounting_period p ON p.id = e.period_id
       WHERE a.condominio_id = ${condominioId} AND a.analitica
       GROUP BY a.id
       ORDER BY string_to_array(a.codigo, '.')::int[]`);

    const linhas: BalanceteLinha[] = [];
    let caixaFinal = 0;
    for (const r of result.rows) {
      const anterior = Number(r.anterior);
      const debitos = Number(r.debitos);
      const creditos = Number(r.creditos);
      if (anterior === 0 && debitos === 0 && creditos === 0) continue;
      const saldoFinal = anterior + debitos - creditos;
      if (r.caixa) caixaFinal += saldoFinal;
      linhas.push({
        accountId: r.account_id,
        codigo: r.codigo,
        nome: r.nome,
        natureza: r.natureza,
        grupo: r.grupo,
        saldoAnteriorCentavos: anterior,
        debitosCentavos: debitos,
        creditosCentavos: creditos,
        saldoFinalCentavos: saldoFinal,
      });
    }

    // Receitas são créditos (saldo negativo); despesas, débitos. Totais do mês em valor absoluto.
    const movement = (l: BalanceteLinha) => l.debitosCentavos - l.creditosCentavos;
    const receitas = -sum(linhas.filter((l) => l.natureza === 'receita').map(movement));
    const despesas = sum(linhas.filter((l) => l.natureza === 'despesa').map(movement));
    const fundo = (grupo: AccountGrupo) =>
      -sum(linhas.filter((l) => l.grupo === grupo).map((l) => l.saldoFinalCentavos));

    return {
      period: toPeriodDto(period),
      linhas,
      totais: {
        receitasCentavos: receitas,
        despesasCentavos: despesas,
        resultadoCentavos: receitas - despesas,
        caixaFinalCentavos: caixaFinal,
        fundos: {
          ordinaria: fundo('ordinaria'),
          fundo_reserva: fundo('fundo_reserva'),
          obras: fundo('obras'),
        },
      },
    };
  }
}

const sum = (values: number[]): number => values.reduce((acc, v) => acc + v, 0);
