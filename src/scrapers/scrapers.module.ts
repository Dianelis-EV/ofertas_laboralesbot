import { Module } from '@nestjs/common';
import { RemoteOkScraper } from './remoteok.scraper';
import { WeWorkRemotelyScraper } from './weworkremotely.scraper';
import { ComputrabajoScraper } from './computrabajo.scraper';
import { InfoJobsScraper } from './infojobs.scraper';
import { IndeedScraper } from './indeed.scraper';
import { LinkedinScraper } from './linkedin.scraper';
import { GetOnBoardScraper } from './getonboard.scraper';

const scrapers = [
  RemoteOkScraper,
  WeWorkRemotelyScraper,
  ComputrabajoScraper,
  InfoJobsScraper,
  IndeedScraper,
  LinkedinScraper,
  GetOnBoardScraper,
];

@Module({
  providers: [...scrapers],
  exports: [...scrapers],
})
export class ScrapersModule {}
