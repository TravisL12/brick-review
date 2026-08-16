import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads .env before anything else constructs a client that reads process.env
 * (PrismaClient reads DATABASE_URL in its constructor, which can run before
 * Nest's ConfigModule factory does).
 *
 * Nearest file wins: apps/api/.env overrides the monorepo root .env.
 */
export function loadEnv(): void {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', '.env'), // monorepo root
    join(__dirname, '..', '..', '.env'), // apps/api
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      // Node >= 20.12
      process.loadEnvFile(path);
    } catch {
      // Older Node, or a malformed file — Nest's ConfigModule still gets a shot.
    }
  }

  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:./prisma/dev.db';
}
