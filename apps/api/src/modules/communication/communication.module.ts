import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { OrgModule } from '../org/org.module';
import { AnnouncementService } from './announcement.service';
import { CommunicationController } from './communication.controller';
import { HomeService } from './home.service';

/** Dono de announcement e announcement_read; monta a tela inicial do morador. */
@Module({
  imports: [OrgModule, BillingModule],
  controllers: [CommunicationController],
  providers: [AnnouncementService, HomeService],
})
export class CommunicationModule {}
