import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RebrickableService } from '../rebrickable/rebrickable.service';
import { BricksetService } from '../brickset/brickset.service';

@Injectable()
export class SetImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rebrickable: RebrickableService,
    private readonly brickset: BricksetService,
  ) {}

  /**
   * Rebuilds a set's picture list: the Rebrickable box shot first, then Brickset's
   * additional photos. Returns the Brickset id so the caller can cache it.
   */
  async sync(
    setId: string,
    setNum: string,
    rebrickableImg: string | null,
    knownBricksetId: number | null,
  ): Promise<number | null> {
    const rows: { url: string; thumbUrl: string | null; source: string; sortOrder: number }[] = [];

    if (rebrickableImg) {
      rows.push({ url: rebrickableImg, thumbUrl: null, source: 'rebrickable', sortOrder: 0 });
    }

    const { bricksetId, images } = await this.brickset.getSetImages(setNum, knownBricksetId);
    for (const img of images) {
      rows.push({
        url: img.url,
        thumbUrl: img.thumbUrl,
        source: 'brickset',
        sortOrder: rows.length,
      });
    }

    // (setId, url) is unique, and the two sources can point at the same file.
    const seen = new Set<string>();
    const unique = rows.filter((row) => {
      if (seen.has(row.url)) return false;
      seen.add(row.url);
      return true;
    });

    await this.prisma.setImage.deleteMany({ where: { setId } });
    if (unique.length > 0) {
      await this.prisma.setImage.createMany({
        data: unique.map((row) => ({ ...row, setId })),
      });
    }

    // Have the CDN render the gallery sizes now rather than under the first viewer.
    await this.rebrickable.warmThumbs(rebrickableImg);
    return bricksetId;
  }
}
