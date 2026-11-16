import { Module } from '@nestjs/common';
import { BlockService } from './block.service';
import { CadastroController, PersonController } from './cadastro.controller';
import { CondominioController } from './condominio.controller';
import { CondominioService } from './condominio.service';
import { GestoraService } from './gestora.service';
import { PersonService } from './person.service';
import { UnitService } from './unit.service';
import { VehicleService } from './vehicle.service';

/**
 * Dono das tabelas gestora, condominio, person, block, unit e vehicle. Outros módulos usam
 * só os serviços exportados.
 */
@Module({
  controllers: [CondominioController, CadastroController, PersonController],
  providers: [
    BlockService,
    CondominioService,
    GestoraService,
    PersonService,
    UnitService,
    VehicleService,
  ],
  exports: [CondominioService, GestoraService, PersonService, UnitService],
})
export class OrgModule {}
