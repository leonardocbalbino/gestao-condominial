import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createAccountRequestSchema,
  createEntryRequestSchema,
  reverseEntryRequestSchema,
  setupLedgerRequestSchema,
  type AccountDto,
  type BalanceteDto,
  type CreateAccountRequest,
  type CreateEntryRequest,
  type JournalEntryDto,
  type PeriodDto,
  type ReverseEntryRequest,
  type SetupLedgerRequest,
} from '@condo/contracts';
import { RequirePermission } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { AccountService } from './account.service';
import { JournalService } from './journal.service';
import { LedgerService } from './ledger.service';
import { PeriodService } from './period.service';

const CONDO = { type: 'condominio', param: 'condominioId' } as const;

@Controller('condominios/:condominioId/ledger')
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly accounts: AccountService,
    private readonly periods: PeriodService,
    private readonly journal: JournalService,
  ) {}

  @Post('setup')
  @RequirePermission('contas:manage', CONDO)
  setup(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(setupLedgerRequestSchema)) body: SetupLedgerRequest,
  ): Promise<PeriodDto> {
    return this.ledger.setup(condominioId, body);
  }

  @Get('accounts')
  @RequirePermission('financeiro:read', CONDO)
  listAccounts(@Param('condominioId') condominioId: string): Promise<AccountDto[]> {
    return this.accounts.list(condominioId);
  }

  @Post('accounts')
  @RequirePermission('contas:manage', CONDO)
  createAccount(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(createAccountRequestSchema)) body: CreateAccountRequest,
  ): Promise<AccountDto> {
    return this.accounts.create(condominioId, body);
  }

  @Get('periods')
  @RequirePermission('financeiro:read', CONDO)
  listPeriods(@Param('condominioId') condominioId: string): Promise<PeriodDto[]> {
    return this.periods.list(condominioId);
  }

  @Post('periods/:periodId/close')
  @RequirePermission('periodo:close', CONDO)
  close(
    @Param('condominioId') condominioId: string,
    @Param('periodId') periodId: string,
  ): Promise<PeriodDto> {
    return this.periods.close(condominioId, periodId);
  }

  @Get('periods/:periodId/verify')
  @RequirePermission('financeiro:read', CONDO)
  verify(
    @Param('condominioId') condominioId: string,
    @Param('periodId') periodId: string,
  ): Promise<{ ok: boolean; hash: string | null }> {
    return this.periods.verify(condominioId, periodId);
  }

  @Get('periods/:periodId/entries')
  @RequirePermission('financeiro:read', CONDO)
  entries(
    @Param('condominioId') condominioId: string,
    @Param('periodId') periodId: string,
  ): Promise<JournalEntryDto[]> {
    return this.journal.listByPeriod(condominioId, periodId);
  }

  @Get('periods/:periodId/balancete')
  @RequirePermission('financeiro:read', CONDO)
  balancete(
    @Param('condominioId') condominioId: string,
    @Param('periodId') periodId: string,
  ): Promise<BalanceteDto> {
    return this.ledger.balancete(condominioId, periodId);
  }

  @Post('entries')
  @RequirePermission('lancamento:create', CONDO)
  post(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(createEntryRequestSchema)) body: CreateEntryRequest,
  ): Promise<JournalEntryDto> {
    return this.journal.post(condominioId, { ...body, origem: 'manual' });
  }

  @Post('entries/:entryId/reverse')
  @RequirePermission('lancamento:create', CONDO)
  reverse(
    @Param('condominioId') condominioId: string,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(reverseEntryRequestSchema)) body: ReverseEntryRequest,
  ): Promise<JournalEntryDto> {
    return this.journal.reverse(condominioId, entryId, body.motivo);
  }
}

/** Modelo de plano de contas da gestora (copiado para cada condomínio novo). */
@Controller('ledger/template/accounts')
export class ChartTemplateController {
  constructor(private readonly accounts: AccountService) {}

  @Get()
  @RequirePermission('contas:manage')
  list(): Promise<AccountDto[]> {
    return this.accounts.list(null);
  }

  @Post()
  @RequirePermission('contas:manage')
  create(
    @Body(new ZodPipe(createAccountRequestSchema)) body: CreateAccountRequest,
  ): Promise<AccountDto> {
    return this.accounts.create(null, body);
  }
}
