import { Module } from '@nestjs/common';
import { SetsController } from './sets.controller';
import { SetsService } from './sets.service';
import { SetSyncService } from './set-sync.service';
import { SetImagesService } from './set-images.service';
import { SetBackfillService } from './set-backfill.service';
import { CatalogAliasService } from './catalog-alias.service';

@Module({
  controllers: [SetsController],
  providers: [
    SetsService,
    SetSyncService,
    SetImagesService,
    SetBackfillService,
    CatalogAliasService,
  ],
  exports: [SetsService, CatalogAliasService],
})
export class SetsModule {}
