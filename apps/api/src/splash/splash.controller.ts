import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SplashService } from './splash.service';

@Controller('splash')
export class SplashController {
  constructor(private readonly splash: SplashService) {}

  /**
   * Public by necessity — this is what the signed-out splash screen renders. It
   * returns curated catalogue sets only, never anything from a user's collection.
   */
  @Public()
  @Get('sets')
  sets() {
    return this.splash.list();
  }
}
