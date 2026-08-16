import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
  ) {}

  @Get()
  async health() {
    let db = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = false;
    }
    return {
      ok: db,
      db,
      rebrickableKeyConfigured: this.rebrickable.isConfigured(),
    };
  }
}
