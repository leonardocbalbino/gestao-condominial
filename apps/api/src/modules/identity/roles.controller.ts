import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  createRoleAssignmentRequestSchema,
  createRoleRequestSchema,
  type CreateRoleAssignmentRequest,
  type CreateRoleRequest,
  type RoleAssignmentDto,
  type RoleDto,
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
}
