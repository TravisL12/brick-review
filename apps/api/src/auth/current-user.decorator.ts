import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** What `AuthGuard` hangs off the request once a session cookie checks out. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Injects the signed-in user. Only valid on routes behind `AuthGuard` — which is
 * every route that is not marked `@Public()`, so the non-null assertion holds.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request>().user!,
);

/**
 * Just the user id, which is all most handlers need to scope a query.
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<Request>().user!.id,
);
