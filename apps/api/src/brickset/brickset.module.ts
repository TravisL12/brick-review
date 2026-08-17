import { Global, Module } from '@nestjs/common';
import { BricksetService } from './brickset.service';

@Global()
@Module({
  providers: [BricksetService],
  exports: [BricksetService],
})
export class BricksetModule {}
