import { Controller, Get, Param, Post } from '@nestjs/common';
import { MinifigsService } from './minifigs.service';

@Controller('minifigs')
export class MinifigsController {
  constructor(private readonly minifigs: MinifigsService) {}

  @Get()
  list() {
    return this.minifigs.list();
  }

  // Declared ahead of ':figNum' so the literal segment is not read as a fig number.
  @Get('stats')
  stats() {
    return this.minifigs.stats();
  }

  @Get(':figNum')
  findOne(@Param('figNum') figNum: string) {
    return this.minifigs.findOne(figNum);
  }

  @Post(':figNum/resync')
  resync(@Param('figNum') figNum: string) {
    return this.minifigs.resync(figNum);
  }
}
