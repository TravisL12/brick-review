import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { BricksetService } from '../brickset/brickset.service';
import { SetImagesService } from './set-images.service';

/** One-off repairs for rows written before a feature existed. All best-effort. */
@Injectable()
export class SetBackfillService implements OnModuleInit {
  private readonly logger = new Logger(SetBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
    private readonly brickset: BricksetService,
    private readonly images: SetImagesService,
  ) {}

  /** Older rows were synced before theme names and image lists existed. */
  async onModuleInit(): Promise<void> {
    await this.backfillThemeNames();
    // Both take minutes across a whole collection; neither may hold up boot.
    void this.backfillImages().then(() => this.warmThumbnails());
  }

  private async backfillThemeNames(): Promise<void> {
    if (!this.rebrickable.isConfigured()) return;
    const stale = await this.prisma.legoSet.findMany({
      where: { themeName: null, themeId: { not: null } },
      select: { id: true, themeId: true },
    });
    if (stale.length === 0) return;

    for (const set of stale) {
      const themeName = await this.rebrickable.getThemePath(set.themeId);
      if (themeName) {
        await this.prisma.legoSet.update({ where: { id: set.id }, data: { themeName } });
      }
    }
    this.logger.log(`Backfilled theme names for ${stale.length} set(s)`);
  }

  /**
   * Sets synced before Brickset support have no picture rows. Fill them in once,
   * without a full resync — the inventory they already hold is still good.
   */
  private async backfillImages(): Promise<void> {
    if (!this.brickset.isConfigured()) return;
    const missing = await this.prisma.legoSet.findMany({
      where: { syncStatus: 'ready', images: { none: {} } },
      select: { id: true, setNum: true, imgUrl: true, bricksetId: true },
    });
    if (missing.length === 0) return;

    this.logger.log(`Backfilling images for ${missing.length} set(s)…`);
    let filled = 0;
    for (const set of missing) {
      try {
        const bricksetId = await this.images.sync(set.id, set.setNum, set.imgUrl, set.bricksetId);
        if (bricksetId !== set.bricksetId) {
          await this.prisma.legoSet.update({ where: { id: set.id }, data: { bricksetId } });
        }
        filled += 1;
      } catch (err) {
        this.logger.warn(`Image backfill failed for ${set.setNum}: ${String(err)}`);
      }
    }
    this.logger.log(`Backfilled images for ${filled} set(s)`);
  }

  /**
   * Rebrickable renders thumbnails on demand, so a set synced before warming
   * existed still has cold gallery sizes. Re-warming is idempotent and costs
   * ~35ms per already-warm preset, so it is cheap enough to simply run at boot.
   */
  private async warmThumbnails(): Promise<void> {
    const sets = await this.prisma.legoSet.findMany({
      where: { imgUrl: { not: null } },
      select: { setNum: true, imgUrl: true },
    });
    if (sets.length === 0) return;

    const startedAt = Date.now();
    for (const set of sets) await this.rebrickable.warmThumbs(set.imgUrl);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    this.logger.log(`Warmed gallery thumbnails for ${sets.length} set(s) in ${seconds}s`);
  }
}
