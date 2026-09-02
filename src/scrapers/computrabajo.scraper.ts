import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { Job } from '../common/job.interface';
import { parseRelativeDate } from '../common/date-parsing';

const DOMAINS: Record<string, string> = {
  mx: 'www.computrabajo.com.mx',
  co: 'co.computrabajo.com',
  ar: 'www.computrabajo.com.ar',
  cl: 'www.computrabajo.cl',
  pe: 'pe.computrabajo.com',
};

@Injectable()
export class ComputrabajoScraper {
  private readonly logger = new Logger(ComputrabajoScraper.name);
  readonly sourceName = 'computrabajo';

  constructor(private readonly config: ConfigService) {}

  async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const country = this.config.get<string>('COUNTRY', 'mx');
    const keyword = this.config.get<string>('KEYWORDS', 'developer').split(',')[0].trim();
    const domain = DOMAINS[country] || DOMAINS.mx;
    const query = keyword.replace(/\s+/g, '-');
    const url = `https://${domain}/trabajo-de-${query}`;

    try {
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-ES,es;q=0.9' },
        timeout: 15000,
      });
      const $ = cheerio.load(data);

      $('article.box_offer').each((_, el) => {
        const linkTag = $(el).find('a.js-o-link').first();
        if (!linkTag.length) return;

        const title = linkTag.text().trim();
        let href = linkTag.attr('href') || '';
        if (href && !href.startsWith('http')) href = `https://${domain}${href}`;

        const company = $(el).find('p.dFlex a').first().text().trim() || 'N/A';
        const location = $(el).find('p.fs13').first().text().trim() || country.toUpperCase();
        const id = crypto.createHash('md5').update(href).digest('hex').slice(0, 12);

        let postedAt: Date | undefined;
        $(el)
          .find('p.fs13, span.fs13, time, .fc_aux')
          .each((__, dateEl) => {
            if (postedAt) return;
            postedAt = parseRelativeDate($(dateEl).text().trim());
          });
        if (!postedAt) postedAt = parseRelativeDate($(el).text());

        jobs.push({
          id: `computrabajo-${id}`,
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
