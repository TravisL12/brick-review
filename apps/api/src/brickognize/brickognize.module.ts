import { Global, Module } from '@nestjs/common';
import { BrickognizeService } from './brickognize.service';

@Global()
@Module({
  providers: [BrickognizeService],
  exports: [BrickognizeService],
})
export class BrickognizeModule {}
