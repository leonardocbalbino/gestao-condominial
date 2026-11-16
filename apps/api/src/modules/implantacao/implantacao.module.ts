import { Controller, Get, Module, Param } from '@nestjs/common';
import type { ImplantacaoDto } from '@condo/contracts';
import { RequirePermission } from '../../http/access';
import { BillingModule } from '../billing/billing.module';
import { IdentityModule } from '../identity/identity.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OrgModule } from '../org/org.module';
import { ImplantacaoService } from './implantacao.service';

@Controller('condominios/:condominioId/implantacao')
export class ImplantacaoController {
  constructor(private readonly implantacao: ImplantacaoService) {}

  /** Os cinco passos da implantação e se a Visão geral já passa para o modo operação. */
  @Get()
  @RequirePermission('condominio:read', { type: 'condominio', param: 'condominioId' })
  status(@Param('condominioId') condominioId: string): Promise<ImplantacaoDto> {
    return this.implantacao.status(condominioId);
  }
}

/** Sem tabelas próprias: só consulta os serviços públicos dos outros módulos. */
@Module({
  imports: [OrgModule, IdentityModule, LedgerModule, BillingModule],
  controllers: [ImplantacaoController],
  providers: [ImplantacaoService],
})
export class ImplantacaoModule {}
