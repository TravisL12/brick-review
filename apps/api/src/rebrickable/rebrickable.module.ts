import { Global, Module } from '@nestjs/common';
import { RebrickableService } from './rebrickable.service';

@Global()
@Module({
  providers: [RebrickableService],
  exports: [RebrickableService],
})
export class RebrickableModule {}
