import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../auth/current-user.decorator';
import { SetsService } from './sets.service';
import { ImportSetsDto } from './dto';

/** Every route here is scoped to the signed-in user's own collection. */
@Controller('sets')
export class SetsController {
  constructor(private readonly sets: SetsService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.sets.list(userId);
  }

  @Get('stats')
  stats(@UserId() userId: string) {
    return this.sets.stats(userId);
  }

  @Get(':setNum')
  findOne(@UserId() userId: string, @Param('setNum') setNum: string) {
    return this.sets.findOne(userId, setNum);
  }

  @Get(':setNum/parts')
  findParts(@UserId() userId: string, @Param('setNum') setNum: string) {
    return this.sets.findParts(userId, setNum);
  }

  @Post('import')
  import(@UserId() userId: string, @Body() dto: ImportSetsDto) {
    return this.sets.importSets(userId, dto);
  }

  @Post('retry-failed')
  retryFailed(@UserId() userId: string) {
    return this.sets.retryFailed(userId);
  }

  @Post(':setNum/resync')
  resync(@UserId() userId: string, @Param('setNum') setNum: string) {
    return this.sets.resync(userId, setNum);
  }

  @Delete(':setNum')
  remove(@UserId() userId: string, @Param('setNum') setNum: string) {
    return this.sets.remove(userId, setNum);
  }
}
