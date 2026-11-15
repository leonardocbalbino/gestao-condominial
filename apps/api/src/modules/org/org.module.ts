import { Module } from '@nestjs/common';
import { CondominioController } from './condominio.controller';
import { CondominioService } from './condominio.service';
import { GestoraService } from './gestora.service';
import { PersonService } from './person.service';

/** Dono das tabelas gestora, condominio e person. Outros módulos usam só os serviços exportados. */
@Module({
  controllers: [CondominioController],
  providers: [CondominioService, GestoraService, PersonService],
  exports: [CondominioService, GestoraService, PersonService],
})
export class OrgModule {}
