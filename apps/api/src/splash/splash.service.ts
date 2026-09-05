import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';

/**
 * The sets the signed-out splash shows off. Hand-picked for variety — a castle, a
 * car, a spaceship, a landmark — rather than by any popularity metric, because
 * Rebrickable exposes no such ranking and inventing one would mean crawling.
 */
const SHOWCASE_SET_NUMS = [
  '75192-1', // Millennium Falcon (UCS)
  '10294-1', // Titanic
  '10276-1', // Colosseum
  '71043-1', // Hogwarts Castle
  '21318-1', // Tree House
  '10305-1', // Lion Knights' Castle
  '42115-1', // Lamborghini Sián FKP 37
  '92176-1', // NASA Apollo Saturn V
  '10497-1', // Galaxy Explorer
  '31203-1', // World Map
] as const;

/** Catalogue entries barely change, so a refresh is a once-a-month affair. */
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SplashService implements OnModuleInit {
  private readonly logger = new Logger(SplashService.name);
  /** Collapses overlapping refreshes into the one already running. */
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
  ) {}

  /**
   * Warms the cache at boot rather than on first view. Ten sets through a ~1.1s
   * throttle is eleven seconds — fine in the background, far too slow to make
   * someone wait for it while a sign-in page renders.
   */
  onModuleInit(): void {
    void this.refresh().catch((err: unknown) =>
      this.logger.warn(`Splash warm-up failed: ${String(err)}`),
    );
  }

  /**
   * Whatever is cached, in curated order. A pure database read: the splash is a
   * public endpoint, so it must never be able to trigger upstream work on demand —
   * otherwise anyone could hold the shared Rebrickable throttle open by reloading
   * the sign-in page.
   */
  list() {
    return this.prisma.showcaseSet.findMany({
      where: { imgUrl: { not: null } },
      orderBy: { sortOrder: 'asc' },
      select: { setNum: true, name: true, year: true, themeName: true, imgUrl: true },
    });
  }

  /** Fetches any showcase set that is missing or older than STALE_AFTER_MS. */
  private refresh(): Promise<void> {
    this.refreshing ??= this.runRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async runRefresh(): Promise<void> {
    if (!this.rebrickable.isConfigured()) return;

    const cached = await this.prisma.showcaseSet.findMany({
      select: { setNum: true, fetchedAt: true, imgUrl: true },
    });
    const freshness = new Map(cached.map((row) => [row.setNum, row]));
    const cutoff = Date.now() - STALE_AFTER_MS;

    const stale = SHOWCASE_SET_NUMS.filter((setNum) => {
      const row = freshness.get(setNum);
      return !row || !row.imgUrl || row.fetchedAt.getTime() < cutoff;
    });
    if (stale.length === 0) return;

    this.logger.log(`Refreshing ${stale.length} showcase set(s)…`);
    let stored = 0;
    for (const setNum of stale) {
      const sortOrder = SHOWCASE_SET_NUMS.indexOf(setNum);
      try {
        const details = await this.rebrickable.getSet(setNum);
        const themeName = await this.rebrickable.getThemePath(details.theme_id);
        const data = {
          name: details.name,
          year: details.year,
          themeName,
          numParts: details.num_parts,
          imgUrl: details.set_img_url,
          sortOrder,
          fetchedAt: new Date(),
        };
        await this.prisma.showcaseSet.upsert({
          where: { setNum },
          create: { setNum, ...data },
          update: data,
        });
        // The splash renders these at tile and hero sizes; warm both so the first
        // visitor is not the one paying for the CDN resize.
        await this.rebrickable.warmThumbs(details.set_img_url);
        stored += 1;
      } catch (err) {
        // One unavailable set just means one fewer tile; the splash is decorative.
        this.logger.warn(`Could not load showcase set ${setNum}: ${String(err)}`);
      }
    }
    this.logger.log(`Showcase cache updated: ${stored}/${stale.length} set(s)`);
  }
}
