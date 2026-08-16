import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { BrickognizeSearchType } from '../brickognize/brickognize.types';

export class IdentifyQueryDto {
  @IsOptional()
  @IsIn(['all', 'parts', 'sets', 'figs'])
  searchType?: BrickognizeSearchType;

  /** Drop Brickognize candidates below this confidence. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;
}

export class ObservationDto {
  /** Rebrickable part number as returned by /identify. */
  @IsString()
  partNum: string;

  /** Confidence or number of times seen; defaults to 1. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;
}

export class RankDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ObservationDto)
  observations: ObservationDto[];
}
