import { Module } from '@nestjs/common';
import { SplashController } from './splash.controller';
import { SplashService } from './splash.service';

@Module({
  controllers: [SplashController],
  providers: [SplashService],
})
export class SplashModule {}
