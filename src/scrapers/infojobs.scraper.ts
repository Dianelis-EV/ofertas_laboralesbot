import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { Job } from '../common/job.interface';
import { parseRelativeDate } from '../common/date-parsing';

@Injectable()
export class InfoJobsScraper {
  private readonly logger = new Logger(InfoJobsScraper.name);
  readonly sourceName = 'infojobs';

  constructor(private readonly config: ConfigService) {}

  async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const keyword = this.config.get<string>('KEYWORDS', 'developer').split(',')[0].trim();
    const url = `https://www.infojobs.net/jobsearch/search-results/list.xhtml?keyword=${encodeURIComponent(keyword)}`;

    try {
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-ES,es;q=0.9' },
        timeout: 15000,
      });
      const $ = cheerio.load(data);

      let cards = $('div.ij-OfferCardContent');
      if (!cards.length) cards = $('a.ij-OfferCard');

      cards.each((_, el) => {
        const isAnchor = $(el).is('a');
        const linkTag = isAnchor ? $(el) : $(el).closest('a');
        let href = linkTag.attr('href') || '';
        if (!href) return;
        if (!href.startsWith('http')) href = `https://www.infojobs.net${href}`;

        const title = $(el).find('h2').first().text().trim() || 'Sin título';
        const company = $(el).find('[class*=company]').first().text().trim() || 'N/A';
        const location = $(el).find('[class*=location]').first().text().trim() || 'N/A';
        const id = crypto.createHash('md5').update(href).digest('hex').slice(0, 12);

        const dateText = $(el).find('[data-testid="sincedate-tag"]').first().text().trim();
        const postedAt = parseRelativeDate(dateText) || parseRelativeDate($(el).text());

        jobs.push({
          id: `infojobs-${id}`,
          title,
          company,
          location,
          url: href,
          source: this.sourceName,
          postedAt,
        });
      });
    } catch (e: any) {
      this.logger.warn(`Error al obtener la página: ${e?.message}`);
    }
    return jobs;
  }
}
