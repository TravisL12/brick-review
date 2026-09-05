import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../auth/current-user.decorator';
import { MinifigsService } from './minifigs.service';

@Controller('minifigs')
export class MinifigsController {
  constructor(private readonly minifigs: MinifigsService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.minifigs.list(userId);
  }

  // Declared ahead of ':figNum' so the literal segment is not read as a fig number.
  @Get('stats')
  stats(@UserId() userId: string) {
    return this.minifigs.stats(userId);
  }

  @Get(':figNum')
  findOne(@UserId() userId: string, @Param('figNum') figNum: string) {
    return this.minifigs.findOne(userId, figNum);
  }

  @Post(':figNum/resync')
  resync(@UserId() userId: string, @Param('figNum') figNum: string) {
    return this.minifigs.resync(userId, figNum);
  }
}
