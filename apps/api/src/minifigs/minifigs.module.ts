import { Module } from '@nestjs/common';
import { SetsModule } from '../sets/sets.module';
import { MinifigsController } from './minifigs.controller';
import { MinifigsService } from './minifigs.service';

@Module({
  // For CatalogAliasService: fig inventories want the same catalogue links set
  // inventories get.
  imports: [SetsModule],
  controllers: [MinifigsController],
  providers: [MinifigsService],
  exports: [MinifigsService],
})
export class MinifigsModule {}
