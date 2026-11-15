import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { OrgModule } from '../org/org.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [IdentityModule, OrgModule],
  controllers: [PlatformController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
