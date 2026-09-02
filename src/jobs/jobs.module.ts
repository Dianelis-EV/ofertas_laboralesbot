import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { ScrapersModule } from '../scrapers/scrapers.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CvModule } from '../cv/cv.module';
import { SeenJobsStore } from '../common/seen-jobs.store';

@Module({
  imports: [ScrapersModule, TelegramModule, CvModule],
  controllers: [JobsController],
  providers: [JobsService, SeenJobsStore],
})
export class JobsModule {}
