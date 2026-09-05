import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
  ) {}

  /** Public: the sign-in page shows the API's status before anyone has a session. */
  @Public()
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
