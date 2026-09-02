import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { Job } from '../common/job.interface';
import { parseRelativeDate } from '../common/date-parsing';

// NOTA: Indeed detecta y bloquea scraping muy agresivamente (Cloudflare/captchas).
// Este scraper es "mejor esfuerzo": puede devolver 0 resultados o romperse en
// cualquier momento. Si eso pasa seguido, desactívalo con ENABLED_SOURCES en .env.

const DOMAINS: Record<string, string> = {
  mx: 'mx.indeed.com',
  co: 'co.indeed.com',
  ar: 'ar.indeed.com',
  cl: 'cl.indeed.com',
  pe: 'pe.indeed.com',
  es: 'es.indeed.com',
};

@Injectable()
export class IndeedScraper {
  private readonly logger = new Logger(IndeedScraper.name);
  readonly sourceName = 'indeed';

  constructor(private readonly config: ConfigService) {}

  async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const country = this.config.get<string>('COUNTRY', 'mx');
    const keyword = this.config.get<string>('KEYWORDS', 'developer').split(',')[0].trim();
    const domain = DOMAINS[country] || 'www.indeed.com';
    const url = `https://${domain}/jobs?q=${encodeURIComponent(keyword)}`;

    try {
      const { data, status } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-ES,es;q=0.9' },
        timeout: 15000,
        validateStatus: () => true,
      });

      if (status !== 200) {
        this.logger.warn(`Bloqueado o error (status ${status}). Se omite esta ronda.`);
        return jobs;
      }

      const $ = cheerio.load(data);
      let cards = $('div.job_seen_beacon');
      if (!cards.length) cards = $('a.tapItem');

      cards.each((_, el) => {
        const title = $(el).find('h2.jobTitle span').first().text().trim() || 'Sin título';
        let href = $(el).find('a').first().attr('href') || '';
        if (!href) return;
        if (!href.startsWith('http')) href = `https://${domain}${href}`;

        const company = $(el).find('span.companyName').first().text().trim() || 'N/A';
        const location = $(el).find('div.companyLocation').first().text().trim() || 'N/A';
        const id = crypto.createHash('md5').update(href).digest('hex').slice(0, 12);

        const dateText =
          $(el).find('span.date, [data-testid*="date"], span[class*="date"]').first().text().trim() ||
          $(el).text();
        const postedAt = parseRelativeDate(dateText);

        jobs.push({
          id: `indeed-${id}`,
          title,
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
