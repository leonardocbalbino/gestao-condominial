import { Injectable } from '@nestjs/common';
import type { CreateGestoraRequest, GestoraDto } from '@condo/contracts';
import { AuditService } from '../audit/audit.service';
import { MagicLinkService } from '../identity/magic-link.service';
import { RolesService } from '../identity/roles.service';
import { UsersService } from '../identity/users.service';
import { GestoraService } from '../org/gestora.service';
import { PersonService } from '../org/person.service';

/**
 * Operações do super admin. Rodam na conexão app_platform (políticas RLS próprias),
 * orquestrando os serviços públicos dos módulos donos das tabelas.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly gestoras: GestoraService,
    private readonly persons: PersonService,
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly magicLinks: MagicLinkService,
    private readonly audit: AuditService,
  ) {}

  /** Cria a gestora, o usuário administrador (papel gestora_admin) e envia o convite. */
  async createGestora(input: CreateGestoraRequest): Promise<GestoraDto> {
    const gestora = await this.gestoras.create({
      nome: input.nome,
      cnpj: input.cnpj,
      branding: input.branding,
    });
    const admin = await this.users.findOrCreateByEmail(input.admin.email);
    await this.persons.ensure({
      gestoraId: gestora.id,
      userId: admin.id,
      nome: input.admin.nome,
      email: admin.email,
    });
    const assignment = await this.roles.assignSystemRoleAsPlatform(
      gestora.id,
      admin.id,
      'gestora_admin',
    );
    await this.magicLinks.issue(admin.id, admin.email, 'invite');

    // Registrado na cadeia da própria gestora: o histórico dela começa com a sua criação.
    await this.audit.record({
      gestoraId: gestora.id,
      action: 'platform.gestora.created',
      resourceType: 'gestora',
      resourceId: gestora.id,
      after: { gestora, adminUserId: admin.id, assignmentId: assignment.id },
    });
    return gestora;
  }

  listGestoras(): Promise<GestoraDto[]> {
    return this.gestoras.list();
  }
}
