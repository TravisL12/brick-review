import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { RebrickableModule } from './rebrickable/rebrickable.module';
import { BrickognizeModule } from './brickognize/brickognize.module';
import { BricksetModule } from './brickset/brickset.module';
import { SetsModule } from './sets/sets.module';
import { MinifigsModule } from './minifigs/minifigs.module';
import { RecognitionModule } from './recognition/recognition.module';
import { SplashModule } from './splash/splash.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Root .env of the monorepo, then a local override inside apps/api.
      envFilePath: [join(__dirname, '..', '.env'), join(__dirname, '..', '..', '..', '.env')],
    }),
    PrismaModule,
    AuthModule,
    RebrickableModule,
    BrickognizeModule,
    BricksetModule,
    SetsModule,
    MinifigsModule,
    RecognitionModule,
    SplashModule,
  ],
  controllers: [HealthController],
  // Every route requires a session unless it opts out with `@Public()`, so a new
  // controller is private by default rather than by remembering to guard it.
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
