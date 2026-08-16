import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportSetsDto {
  /**
   * Free-form blob of set numbers: newlines, commas, spaces or semicolons.
   * e.g. "10276, 75192\n21318"
   */
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  text?: string;

  /** Alternative to `text` for programmatic callers. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  setNums?: string[];
}
