import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Emails are stored and compared lower-cased, so normalise on the way in. */
const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(254)
  @Transform(normaliseEmail)
  email!: string;

  /**
   * Long enough to matter, capped near bcrypt's 72-byte truncation point so a
   * password is not silently shortened at both ends. Note the cap is 72 *characters*
   * (class-validator counts UTF-16 code units), so a password of non-ASCII characters
   * can still exceed 72 bytes and lose its tail. Harmless — it only trims entropy from
   * passwords that have plenty — but use Buffer.byteLength if that needs to be exact.
   */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(254)
  @Transform(normaliseEmail)
  email!: string;

  @IsString()
  @MaxLength(72)
  password!: string;
}
