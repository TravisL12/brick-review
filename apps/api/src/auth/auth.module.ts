import { Global, Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService, SESSION_MAX_AGE_MS } from './auth.service';

/**
 * A missing secret is a dev convenience, not a silent default: a hard-coded
 * fallback would let anyone forge a session on a deployed instance. A random
 * per-boot secret keeps localhost working while making the cost obvious —
 * every restart signs everyone out until AUTH_JWT_SECRET is set.
 */
function sessionSecret(): string {
  const configured = process.env.AUTH_JWT_SECRET?.trim();
  if (configured) return configured;
  new Logger('AuthModule').warn(
    'AUTH_JWT_SECRET is not set — using a random secret for this process. ' +
      'Sessions will not survive a restart. Set it in .env.',
  );
  return randomBytes(48).toString('hex');
}

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: sessionSecret(),
      signOptions: { expiresIn: `${Math.floor(SESSION_MAX_AGE_MS / 1000)}s` },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
