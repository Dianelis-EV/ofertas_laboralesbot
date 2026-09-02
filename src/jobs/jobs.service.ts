import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Job } from '../common/job.interface';
import { SeenJobsStore } from '../common/seen-jobs.store';
import { isRemoteJob, matchesLevel } from '../common/matching';
import { TelegramService } from '../telegram/telegram.service';
import { CvService } from '../cv/cv.service';
import { RemoteOkScraper } from '../scrapers/remoteok.scraper';
import { WeWorkRemotelyScraper } from '../scrapers/weworkremotely.scraper';
import { ComputrabajoScraper } from '../scrapers/computrabajo.scraper';
import { InfoJobsScraper } from '../scrapers/infojobs.scraper';
import { IndeedScraper } from '../scrapers/indeed.scraper';
import { LinkedinScraper } from '../scrapers/linkedin.scraper';
import { GetOnBoardScraper } from '../scrapers/getonboard.scraper';

interface Scraper {
  sourceName: string;
  fetchJobs(): Promise<Job[]>;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly scrapers: Scraper[];
  private readonly enabledSources: Set<string>;
  private readonly keywords: string[];
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly seenJobsStore: SeenJobsStore,
    private readonly telegram: TelegramService,
    private readonly cv: CvService,
    remoteOk: RemoteOkScraper,
    wwr: WeWorkRemotelyScraper,
    computrabajo: ComputrabajoScraper,
    infojobs: InfoJobsScraper,
    indeed: IndeedScraper,
    linkedin: LinkedinScraper,
    getonboard: GetOnBoardScraper,
  ) {
    this.scrapers = [remoteOk, wwr, computrabajo, infojobs, indeed, linkedin, getonboard];

    const enabledEnv = this.config.get<string>(
      'ENABLED_SOURCES',
      'remoteok,weworkremotely,computrabajo,infojobs,indeed,linkedin,getonboard',
    );
    this.enabledSources = new Set(enabledEnv.split(',').map((s) => s.trim().toLowerCase()));

    // Por defecto alineado al foco del prompt de referencia: fullstack/backend remoto.
    this.keywords = this.config
      .get<string>(
        'KEYWORDS',
        'developer,desarrollador,programador,fullstack,full stack,backend,back-end,software engineer',
      )
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
  }

  // Cada 30 minutos. Indeed/LinkedIn se dejan en el mismo intervalo que el
  // resto para no arriesgar bloqueos por exceso de requests.
  @Cron('*/30 * * * *')
  async handleCron() {
    await this.runSearch();
  }

  async runSearch(): Promise<{ found: number; sent: number }> {
    if (this.running) {
      this.logger.warn('Ya hay una búsqueda en curso, se omite esta ejecución.');
      return { found: 0, sent: 0 };
    }
    this.running = true;

    const cvSkills = this.cv.getSkills().map((s) => s.toLowerCase());
    const selectedLevels = this.cv.getLevels();

    let totalFound = 0;
    let totalSent = 0;

    try {
      for (const scraper of this.scrapers) {
        if (!this.enabledSources.has(scraper.sourceName)) continue;

        this.logger.log(`Buscando en ${scraper.sourceName}...`);
        let jobs: Job[] = [];
        try {
          jobs = await scraper.fetchJobs();
        } catch (e: any) {
          this.logger.error(`Error inesperado en ${scraper.sourceName}: ${e?.message}`);
          continue;
        }
        totalFound += jobs.length;
        this.logger.log(`${scraper.sourceName}: ${jobs.length} ofertas encontradas.`);

        for (const job of jobs) {
          if (this.seenJobsStore.has(job.id)) continue;
          if (!this.passesAllFilters(job, cvSkills, selectedLevels)) continue;

          const message = this.telegram.formatJobMessage(job);
          const ok = await this.telegram.sendMessage(message);
          if (ok) {
            this.seenJobsStore.add(job.id);
            totalSent += 1;
            await this.sleep(1000); // evita saturar la API de Telegram
          }
        }
      }

      this.seenJobsStore.persist();
      this.logger.log(`Listo. ${totalSent} ofertas nuevas enviadas a Telegram.`);
    } finally {
      this.running = false;
    }

    return { found: totalFound, sent: totalSent };
  }

  /**
   * Una oferta pasa si: es remota, coincide su nivel (o no se detecta nivel),
   * y además coincide con las palabras clave base O con alguna skill de tu CV.
   * El "O" es intencional: el título de una oferta rara vez repite tu stack
   * completo, así que basta con que aparezca una señal clara.
   */
  private passesAllFilters(job: Job, cvSkills: string[], selectedLevels: string[]): boolean {
    if (!isRemoteJob(job.source, job.title, job.location)) return false;
    if (!matchesLevel(job.title, selectedLevels as any)) return false;

    const title = job.title.toLowerCase();
    const matchesBaseKeywords = this.keywords.some((kw) => title.includes(kw));
    const matchesCv = cvSkills.length > 0 && cvSkills.some((skill) => title.includes(skill));

    return matchesBaseKeywords || matchesCv;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
