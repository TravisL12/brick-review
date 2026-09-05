/**
 * Seeds two fake "ready" sets so the scanner can be exercised without a
 * Rebrickable API key. Run: yarn workspace @brick-review/api seed:demo
 * Remove with: yarn workspace @brick-review/api seed:demo --clear
 *
 * Sets belong to a user, so register an account in the app first. The demo sets
 * land in the oldest account unless you name one: seed:demo --email=me@example.com
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_SETS = [
  {
    setNum: 'DEMO-BRICKS-1',
    name: 'Demo — Classic Bricks',
    year: 2024,
    numParts: 6,
    parts: [
      ['3001', 'Brick 2 x 4', 4, 'Red', '#C91A09'],
      ['3002', 'Brick 2 x 3', 2, 'Blue', '#0055BF'],
      ['3003', 'Brick 2 x 2', 6, 'Yellow', '#F2CD37'],
      ['3004', 'Brick 1 x 2', 8, 'White', '#FFFFFF'],
      ['3020', 'Plate 2 x 4', 3, 'Black', '#05131D'],
      ['3022', 'Plate 2 x 2', 5, 'Green', '#237841'],
    ],
  },
  {
    setNum: 'DEMO-PLATES-1',
    name: 'Demo — Plates & Tiles',
    year: 2024,
    numParts: 4,
    parts: [
      ['3020', 'Plate 2 x 4', 10, 'Light Bluish Gray', '#A0A5A9'],
      ['3022', 'Plate 2 x 2', 12, 'Light Bluish Gray', '#A0A5A9'],
      ['3068b', 'Tile 2 x 2', 6, 'Dark Bluish Gray', '#6C6E68'],
      ['3069b', 'Tile 1 x 2', 8, 'Tan', '#E4CD9E'],
    ],
  },
];

/**
 * The account the demo sets belong to: `--email=` if given, otherwise the oldest
 * one. There is no fallback to creating a user — a seeded password would be a
 * live credential on anything that ever gets deployed.
 */
async function resolveUser() {
  const flag = process.argv.find((arg) => arg.startsWith('--email='));
  const email = flag?.slice('--email='.length).trim().toLowerCase();

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!user) {
    throw new Error(
      email
        ? `No account with email ${email}. Register it in the app first.`
        : 'No accounts yet — register one in the app (http://localhost:5173) first.',
    );
  }
  return user;
}

async function clear() {
  const user = await resolveUser();
  for (const set of DEMO_SETS) {
    await prisma.legoSet.deleteMany({ where: { userId: user.id, setNum: set.setNum } });
  }
  await prisma.partAlias.deleteMany({ where: { source: 'DemoSeed' } });
  console.log('Demo sets removed.');
}

async function seed() {
  const user = await resolveUser();
  console.log(`Seeding into ${user.email}'s collection.`);

  for (const demo of DEMO_SETS) {
    await prisma.legoSet.deleteMany({ where: { userId: user.id, setNum: demo.setNum } });
    const set = await prisma.legoSet.create({
      data: {
        userId: user.id,
        setNum: demo.setNum,
        name: demo.name,
        year: demo.year,
        numParts: demo.numParts,
        syncStatus: 'ready',
        lastSyncedAt: new Date(),
      },
    });

    for (const [partNum, name, quantity, colorName, colorHex] of demo.parts) {
      await prisma.setPart.create({
        data: { setId: set.id, partNum, name, quantity, colorName, colorHex, colorId: 0 },
      });
      // Brickognize returns BrickLink ids, which match these part numbers 1:1.
      for (const source of ['Rebrickable', 'BrickLink']) {
        const exists = await prisma.partAlias.findFirst({
          where: { source, externalId: partNum, partNum },
        });
        if (!exists) {
          await prisma.partAlias.create({ data: { source, externalId: partNum, partNum } });
        }
      }
    }
    console.log(`Seeded ${demo.setNum} with ${demo.parts.length} parts`);
  }
}

const run = process.argv.includes('--clear') ? clear : seed;
run()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
