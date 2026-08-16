import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { RebrickableModule } from './rebrickable/rebrickable.module';
import { BrickognizeModule } from './brickognize/brickognize.module';
import { SetsModule } from './sets/sets.module';
import { RecognitionModule } from './recognition/recognition.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Root .env of the monorepo, then a local override inside apps/api.
      envFilePath: [join(__dirname, '..', '.env'), join(__dirname, '..', '..', '..', '.env')],
    }),
    PrismaModule,
    RebrickableModule,
    BrickognizeModule,
    SetsModule,
    RecognitionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
