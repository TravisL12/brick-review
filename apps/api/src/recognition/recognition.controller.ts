import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserId } from '../auth/current-user.decorator';
import { RecognitionService } from './recognition.service';
import { IdentifyQueryDto, RankDto } from './dto';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

@Controller('recognition')
export class RecognitionController {
  constructor(private readonly recognition: RecognitionService) {}

  /** multipart/form-data with a single `image` field (a camera frame or a photo). */
  @Post('identify')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype?.startsWith('image/')) {
          cb(new BadRequestException(`Expected an image, got ${file.mimetype}`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  identify(
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query() query: IdentifyQueryDto,
  ) {
    if (!file) throw new BadRequestException('No image uploaded (expected field "image")');
    return this.recognition.identify(
      userId,
      file.buffer,
      file.originalname ?? 'capture.jpg',
      file.mimetype,
      query.searchType ?? 'parts',
      query.minScore ?? 0,
    );
  }

  /** Ranks owned sets against every part seen so far in a scan session. */
  @Post('rank')
  rank(@UserId() userId: string, @Body() dto: RankDto) {
    return this.recognition.rank(userId, dto.observations);
  }
}
