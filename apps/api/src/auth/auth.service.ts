import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './current-user.decorator';
import type { LoginDto, RegisterDto } from './dto';

/** Cost factor for bcrypt. 12 is ~250ms on modern hardware — slow enough to matter. */
const BCRYPT_ROUNDS = 12;

export const SESSION_COOKIE = 'br_session';

/** How long a session cookie stays valid. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  sub: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Creates an account. The very first one becomes `admin`, so a fresh install has
   * an owner without a seeding step.
   *
   * The unique-constraint catch is not belt-and-braces: two simultaneous registers
   * for the same address both pass the `count` check, and only the database can
   * settle it.
   */
  async register(dto: RegisterDto): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with that email already exists');

    const isFirstUser = (await this.prisma.user.count()) === 0;
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName?.trim() || null,
          role: isFirstUser ? 'admin' : 'user',
        },
      });
      this.logger.log(`Registered ${user.email} as ${user.role}`);
      return toAuthUser(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('An account with that email already exists');
      }
      throw err;
    }
  }

  /**
   * Verifies credentials. The failure message never says which half was wrong —
   * a distinct "no such account" reply would turn this into an email oracle.
   */
  async validate(dto: LoginDto): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Hash anyway when the account does not exist, so a missing email and a wrong
    // password take the same time to answer.
    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await compare(dto.password, passwordHash);
    if (!user || !ok) throw new UnauthorizedException('Email or password is incorrect');
    return toAuthUser(user);
  }

  /** Signs the session token that goes into the cookie. */
  issueToken(user: AuthUser): string {
    return this.jwt.sign({ sub: user.id } satisfies SessionPayload);
  }

  /** Resolves a session token back to a user, or null if it is invalid or stale. */
  async userFromToken(token: string): Promise<AuthUser | null> {
    let payload: SessionPayload;
    try {
      payload = this.jwt.verify<SessionPayload>(token);
    } catch {
      return null;
    }
    // Re-read on every request rather than trusting the token's copy, so a deleted
    // account or a changed role takes effect immediately instead of in 30 days.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    return user ? toAuthUser(user) : null;
  }
}

/** A real bcrypt hash of a value nobody can supply, for the constant-time login path. */
const DUMMY_HASH = '$2b$12$sQMylZw7RAslwebod4H8meMKeiJI5tddybNDcv2m0i6am4LR86csy';

function toAuthUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
