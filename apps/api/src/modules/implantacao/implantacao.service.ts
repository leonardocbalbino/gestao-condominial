import { Injectable } from '@nestjs/common';
import type { ImplantacaoDto } from '@condo/contracts';
import { ChargeService } from '../billing/charge.service';
import { PaymentAccountService } from '../billing/payment-account.service';
import { RolesService } from '../identity/roles.service';
import { PeriodService } from '../ledger/period.service';
import { BlockService } from '../org/block.service';
import { CondominioService } from '../org/condominio.service';
import { UnitService } from '../org/unit.service';
import { implantacaoStatus } from './implantacao';

/**
 * Junta o estado do condomínio pelos serviços públicos de cada módulo (sem ler tabela
 * de outro módulo). As consultas são em sequência: a transação da request usa uma
 * conexão só.
 */
@Injectable()
export class ImplantacaoService {
  constructor(
    private readonly condominios: CondominioService,
    private readonly units: UnitService,
    private readonly blocks: BlockService,
    private readonly accounts: PaymentAccountService,
    private readonly periods: PeriodService,
    private readonly roles: RolesService,
    private readonly charges: ChargeService,
  ) {}

  async status(condominioId: string): Promise<ImplantacaoDto> {
    await this.condominios.get(condominioId); // 404 se não existe ou é de outra gestora
    const unidades = (await this.units.list(condominioId)).length;
    const blocos = (await this.blocks.list(condominioId)).map((b) => b.nome);
    const provedor = await this.accounts.providerOf(condominioId);
    const primeiroMes = (await this.periods.list(condominioId)).at(-1)?.mes ?? null;
    const equipe = await this.roles.listCondominioStaff(condominioId);
    const cobrancasEmitidas = await this.charges.countEmitted(condominioId);
    return implantacaoStatus({
      condominioId,
      unidades,
      blocos,
      provedor,
      primeiroMes,
      equipe,
      cobrancasEmitidas,
    });
  }
}
