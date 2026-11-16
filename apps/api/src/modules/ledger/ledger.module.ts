import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { OrgModule } from '../org/org.module';
import { AccountService } from './account.service';
import { ClosingGuards } from './closing-guards';
import { JournalService } from './journal.service';
import { ChartTemplateController, LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { PeriodService } from './period.service';

/** Dono de account, accounting_period, journal_entry e journal_line. */
@Module({
  imports: [OrgModule, DocumentsModule],
  controllers: [LedgerController, ChartTemplateController],
  providers: [AccountService, ClosingGuards, JournalService, LedgerService, PeriodService],
  exports: [AccountService, ClosingGuards, JournalService, PeriodService],
})
export class LedgerModule {}
