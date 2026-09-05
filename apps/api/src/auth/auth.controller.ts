import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AuthService, SESSION_COOKIE, SESSION_MAX_AGE_MS } from './auth.service';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { LoginDto, RegisterDto } from './dto';
import { Public } from './public.decorator';

/**
 * `secure` only in production: a localhost dev server is plain HTTP, and a secure
 * cookie there would simply never be stored. `sameSite: lax` lets the SPA's
 * same-origin fetches carry it while blocking cross-site form posts.
 */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto);
    res.cookie(SESSION_COOKIE, this.auth.issueToken(user), cookieOptions());
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validate(dto);
    res.cookie(SESSION_COOKIE, this.auth.issueToken(user), cookieOptions());
    return user;
  }

  /**
   * Public so that signing out of an already-expired session still clears the
   * cookie rather than answering 401.
   */
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    return { ok: true };
  }

  /** The web app calls this on boot to decide between the app and the sign-in page. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
