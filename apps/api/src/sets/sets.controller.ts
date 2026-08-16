import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { SetsService } from './sets.service';
import { ImportSetsDto } from './dto';

@Controller('sets')
export class SetsController {
  constructor(private readonly sets: SetsService) {}

  @Get()
  list() {
    return this.sets.list();
  }

  @Get('stats')
  stats() {
    return this.sets.stats();
  }

  @Get(':setNum')
  findOne(@Param('setNum') setNum: string) {
    return this.sets.findOne(setNum);
  }

  @Get(':setNum/parts')
  findParts(@Param('setNum') setNum: string) {
    return this.sets.findParts(setNum);
  }

  @Post('import')
  import(@Body() dto: ImportSetsDto) {
    return this.sets.importSets(dto);
  }

  @Post('retry-failed')
  retryFailed() {
    return this.sets.retryFailed();
  }

  @Post(':setNum/resync')
  resync(@Param('setNum') setNum: string) {
    return this.sets.resync(setNum);
  }

  @Delete(':setNum')
  remove(@Param('setNum') setNum: string) {
    return this.sets.remove(setNum);
  }
}
