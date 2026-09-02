import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { Job } from '../common/job.interface';
import { parseRelativeDate } from '../common/date-parsing';

// NOTA: LinkedIn no ofrece API pública gratuita de empleos y puede limitar o
// bloquear este endpoint "guest" sin aviso. Trátalo como opcional: si falla
// seguido, desactívalo con ENABLED_SOURCES en .env.

const BASE_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

@Injectable()
export class LinkedinScraper {
  private readonly logger = new Logger(LinkedinScraper.name);
  readonly sourceName = 'linkedin';

  constructor(private readonly config: ConfigService) {}

  async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const keyword = this.config.get<string>('KEYWORDS', 'developer').split(',')[0].trim();

    try {
      const { data, status } = await axios.get(BASE_URL, {
        params: { keywords: keyword, location: '', start: 0 },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
        validateStatus: () => true,
      });

      if (status !== 200) {
        this.logger.warn(`Bloqueado o error (status ${status}). Se omite esta ronda.`);
        return jobs;
      }

      const $ = cheerio.load(data);
      $('li').each((_, el) => {
        const titleTag = $(el).find('h3.base-search-card__title').first();
        const linkTag = $(el).find('a.base-card__full-link').first();
        if (!titleTag.length || !linkTag.length) return;

        const href = (linkTag.attr('href') || '').split('?')[0];
        const company = $(el).find('h4.base-search-card__subtitle').first().text().trim() || 'N/A';
        const location = $(el).find('span.job-search-card__location').first().text().trim() || 'N/A';
        const id = crypto.createHash('md5').update(href).digest('hex').slice(0, 12);

        const timeTag = $(el)
          .find('time.job-search-card__listdate, time.job-search-card__listdate--new')
          .first();
        const postedAt =
          parseRelativeDate(timeTag.text().trim()) ||
          (timeTag.attr('datetime') ? new Date(timeTag.attr('datetime') as string) : undefined);

        jobs.push({
          id: `linkedin-${id}`,
          title: titleTag.text().trim(),
          company,
          location,
          url: href,
          source: this.sourceName,
          postedAt,
        });
      });
    } catch (e: any) {
      this.logger.warn(`Error de conexión: ${e?.message}`);
    }
    return jobs;
  }
}
