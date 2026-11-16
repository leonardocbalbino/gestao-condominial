import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { MeDto } from '@condo/contracts';
import { currentContext } from '../../db/request-context';
import { Authenticated } from '../../http/access';
import { GestoraService } from '../org/gestora.service';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';

@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly gestoras: GestoraService,
  ) {}

  /** Quem sou eu e em quais gestoras atuo (para o app escolher o x-gestora-id). */
  @Get()
  @Authenticated()
  async me(): Promise<MeDto> {
    const user = await this.users.findById(currentContext().userId ?? '');
    if (!user) throw new NotFoundException();

    const assignments = await this.roles.activeAssignmentsOfCurrentUser();
    const summaries = await this.gestoras.summariesByIds([
      ...new Set(assignments.map((a) => a.gestoraId)),
    ]);
    const byGestora = new Map<string, MeDto['gestoras'][number]>();
    for (const a of assignments) {
      const summary = summaries.get(a.gestoraId);
      const entry = byGestora.get(a.gestoraId) ?? {
        id: a.gestoraId,
        nome: summary?.nome ?? '',
        branding: summary?.branding ?? {},
        roles: [],
      };
      entry.roles.push({ key: a.roleKey, name: a.roleName, scope: a.scope });
      byGestora.set(a.gestoraId, entry);
    }

    return {
      id: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      mfaEnabled: Boolean(user.totpEnabledAt),
      gestoras: [...byGestora.values()],
    };
  }
}
