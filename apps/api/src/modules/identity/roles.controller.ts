import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createRoleAssignmentRequestSchema,
  createRoleRequestSchema,
  inviteCondominioStaffRequestSchema,
  type CreateRoleAssignmentRequest,
  type CreateRoleRequest,
  type InviteCondominioStaffRequest,
  type RoleAssignmentDto,
  type RoleDto,
  type StaffInviteDto,
} from '@condo/contracts';
import { RequirePermission } from '../../http/access';
import { ZodPipe } from '../../http/zod.pipe';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermission('role:manage', { type: 'any' })
  list(): Promise<RoleDto[]> {
    return this.roles.list();
  }

  @Post('roles')
  @RequirePermission('role:manage')
  create(@Body(new ZodPipe(createRoleRequestSchema)) body: CreateRoleRequest): Promise<RoleDto> {
    return this.roles.create(body);
  }

  /** O escopo do corpo é checado no serviço: precisa de role:manage nele. */
  @Post('role-assignments')
  @RequirePermission('role:manage', { type: 'any' })
  assign(
    @Body(new ZodPipe(createRoleAssignmentRequestSchema)) body: CreateRoleAssignmentRequest,
  ): Promise<RoleAssignmentDto> {
    return this.roles.assign(body);
  }

  /** Gestora convida síndico ou conselheiro do condomínio por e-mail (matriz §9). */
  @Post('condominios/:condominioId/staff-invites')
  @RequirePermission('role:manage', { type: 'condominio', param: 'condominioId' })
  invite(
    @Param('condominioId') condominioId: string,
    @Body(new ZodPipe(inviteCondominioStaffRequestSchema)) body: InviteCondominioStaffRequest,
  ): Promise<RoleAssignmentDto> {
    return this.roles.inviteCondominioStaff(condominioId, body);
  }

  /** Síndicos e conselheiros convidados, com status (pendente/aceito). */
  @Get('condominios/:condominioId/staff-invites')
  @RequirePermission('role:manage', { type: 'condominio', param: 'condominioId' })
  listInvites(@Param('condominioId') condominioId: string): Promise<StaffInviteDto[]> {
    return this.roles.listCondominioStaff(condominioId);
  }

  @Post('condominios/:condominioId/staff-invites/:assignmentId/resend')
  @RequirePermission('role:manage', { type: 'condominio', param: 'condominioId' })
  resend(
    @Param('condominioId') condominioId: string,
    @Param('assignmentId') assignmentId: string,
  ): Promise<StaffInviteDto> {
    return this.roles.resendStaffInvite(condominioId, assignmentId);
  }
}
