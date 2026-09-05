import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Applied globally in AppModule, so every route needs a session unless it is
 * marked `@Public()`. Attaches the user to the request for `@CurrentUser()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in');

    const user = await this.auth.userFromToken(token);
    if (!user) throw new UnauthorizedException('Session expired — sign in again');

    req.user = user;
    return true;
  }
}
