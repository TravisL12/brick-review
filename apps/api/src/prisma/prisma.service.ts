import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.applyPragmas();
  }

  /**
   * SQLite defaults to rollback-journal mode, where a writer takes a lock that
   * blocks *readers* too. That was invisible with one user; with a household it
   * means every page load overlapping the sync queue's writes can fail with
   * SQLITE_BUSY. WAL lets readers run straight through writes, and busy_timeout
   * turns the remaining write-write collisions into a short wait instead of an
   * immediate error.
   *
   * `journal_mode` persists in the database file, so this is really only needed
   * once — but it is idempotent and costs microseconds, so setting it on every
   * boot is simpler than tracking whether some other tool has changed it back.
   */
  private async applyPragmas(): Promise<void> {
    try {
      // Returns a row ("wal"), so it has to be queried rather than executed.
      const [{ journal_mode: mode }] = await this.$queryRawUnsafe<
        { journal_mode: string }[]
      >('PRAGMA journal_mode = WAL');
      await this.$executeRawUnsafe('PRAGMA busy_timeout = 5000');
      // NORMAL is the standard companion to WAL: it keeps the durability that
      // matters here while dropping an fsync per transaction.
      await this.$executeRawUnsafe('PRAGMA synchronous = NORMAL');
      this.logger.log(`SQLite journal_mode=${mode}, busy_timeout=5000ms`);
    } catch (err) {
      // A non-SQLite datasource (or a future Postgres move) has no such pragmas.
      this.logger.warn(`Could not apply SQLite pragmas: ${String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
