import { Controller, Get } from '@nestjs/common';
import { currentContext } from '../../db/request-context';
import { RequirePermission } from '../../http/access';
import { AuditService, type ChainVerification } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Verifica a integridade da cadeia de auditoria da gestora em contexto. */
  @Get('verify')
  @RequirePermission('audit:read')
  verify(): Promise<ChainVerification> {
    const { gestoraId } = currentContext();
    return this.audit.verifyChain(gestoraId ?? '');
  }
}
