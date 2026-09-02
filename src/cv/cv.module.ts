import { Module } from '@nestjs/common';
import { CvService } from './cv.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  providers: [CvService],
  exports: [CvService],
})
export class CvModule {}
