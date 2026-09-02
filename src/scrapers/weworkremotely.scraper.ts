import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import Parser from 'rss-parser';
import { Job } from '../common/job.interface';

const RSS_URL = 'https://weworkremotely.com/categories/remote-programming-jobs.rss';

@Injectable()
export class WeWorkRemotelyScraper {
  private readonly logger = new Logger(WeWorkRemotelyScraper.name);
  private readonly parser = new Parser();
  readonly sourceName = 'weworkremotely';

  async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
      const feed = await this.parser.parseURL(RSS_URL);
      for (const entry of feed.items) {
        const link = entry.link || '';
        const id = crypto.createHash('md5').update(link).digest('hex').slice(0, 12);

        let company = 'N/A';
        let title = entry.title || 'Sin título';
        if (title.includes(':')) {
          const [c, ...rest] = title.split(':');
          company = c.trim();
          title = rest.join(':').trim();
        }

        jobs.push({
          id: `wwr-${id}`,
          title,
          company,
          location: 'Remoto',
          url: link,
          source: this.sourceName,
        });
      }
    } catch (e: any) {
      this.logger.warn(`Error al parsear RSS: ${e?.message}`);
    }
    return jobs;
  }
}
