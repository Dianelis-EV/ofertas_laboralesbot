import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { Job } from '../common/job.interface';
import { extractRelativeDate } from '../common/date-utils';

// NOTA: igual que Computrabajo/InfoJobs, esto es scraping de HTML público.
// GetOnBoard no bloquea tan agresivo como Indeed/LinkedIn, pero si cambian su
// maquetación estos selectores pueden dejar de encontrar tarjetas. Si eso pasa,
// abre la URL en el navegador, inspecciona una tarjeta de oferta y ajusta los
// selectores de abajo.

const SEARCH_URL = 'https://www.getonbrd.com/jobs/programming?remote=true';

@Injectable()
export class GetOnBoardScraper {
  private readonly logger = new Logger(GetOnBoardScraper.name);
  readonly sourceName = 'getonboard';

  async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
      const { data } = await axios.get(SEARCH_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-ES,es;q=0.9' },
        timeout: 15000,
      });
      const $ = cheerio.load(data);

      $('a[href*="/jobs/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        // Filtra enlaces que no son de una oferta individual (ej. la propia URL de búsqueda)
        if (!href.match(/\/jobs\/[a-z0-9-]+-\d+/i)) return;

        const title = $(el).find('h2, h3').first().text().trim() || $(el).text().trim();
        if (!title || title.length < 3) return;

        const card = $(el).closest('div');
        const company = card.find('[class*=company]').first().text().trim() || 'N/A';
        const location = card.find('[class*=location], [class*=remote]').first().text().trim() || 'Remoto';

        const fullUrl = href.startsWith('http') ? href : `https://www.getonbrd.com${href}`;
        const id = crypto.createHash('md5').update(fullUrl).digest('hex').slice(0, 12);
        const detectedDate = extractRelativeDate(card.text());

        jobs.push({
          id: `getonboard-${id}`,
          title,
          company,
          location,
          url: fullUrl,
          source: this.sourceName,
          postedAt: detectedDate ? detectedDate.toISOString() : undefined,
        });
      });
    } catch (e: any) {
      this.logger.warn(`Error al obtener la página: ${e?.message}`);
    }

    // Deduplicar por id (un mismo link puede matchear más de un selector)
    const unique = new Map(jobs.map((j) => [j.id, j]));
    return Array.from(unique.values());
  }
}
