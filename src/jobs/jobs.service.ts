import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Job } from '../common/job.interface';
import { SeenJobsStore } from '../common/seen-jobs.store';
import { isRemoteJob, matchesLevel } from '../common/matching';
import { passesRecencyFilter } from '../common/date-utils';
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
  private readonly recencyHours: number;
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

    // Estas KEYWORDS son la base compartida entre todos los usuarios. El
    // "plus" de cada quien es su propio CV (ver passesAllFilters).
    this.keywords = this.config
      .get<string>(
        'KEYWORDS',
        'developer,desarrollador,programador,fullstack,full stack,backend,back-end,software engineer',
      )
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    this.recencyHours = this.config.get<number>('RECENCY_HOURS', 72);
  }

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

    const chatIds = this.telegram.getAuthorizedChatIds();
    if (chatIds.length === 0) {
      this.logger.warn('No hay usuarios autorizados (TELEGRAM_CHAT_IDS vacío). Nada que enviar.');
      this.running = false;
      return { found: 0, sent: 0 };
    }

    let totalFound = 0;
    let totalSent = 0;

    try {
      // 1) Se hace scraping UNA sola vez por ciclo, sin importar cuántos
      // usuarios haya — así no se multiplica el riesgo de bloqueo por IP.
      const allJobs: Job[] = [];
      for (const scraper of this.scrapers) {
        if (!this.enabledSources.has(scraper.sourceName)) continue;

        this.logger.log(`Buscando en ${scraper.sourceName}...`);
        try {
          const jobs = await scraper.fetchJobs();
          allJobs.push(...jobs);
          totalFound += jobs.length;
          this.logger.log(`${scraper.sourceName}: ${jobs.length} ofertas encontradas.`);
        } catch (e: any) {
          this.logger.error(`Error inesperado en ${scraper.sourceName}: ${e?.message}`);
        }
      }

      // 2) Cada usuario recibe solo lo que le aplica a SU perfil, y su
      // propio historial de "ya visto" — independiente del resto.
      for (const chatId of chatIds) {
        const cvSkills = this.cv.getSkills(chatId).map((s) => s.toLowerCase());
        const selectedLevels = this.cv.getLevels(chatId);

        let passedFilter = 0;
        let alreadySeen = 0;
        let sentToThisUser = 0;
        const failReasons: Record<string, number> = { remote: 0, level: 0, recency: 0, keyword: 0 };

        for (const job of allJobs) {
          const diagnosis = this.diagnoseFilters(job, cvSkills, selectedLevels);
          if (diagnosis !== 'pass') {
            failReasons[diagnosis] += 1;
            continue;
          }
          passedFilter += 1;

          if (this.seenJobsStore.has(chatId, job.id)) {
            alreadySeen += 1;
            continue;
          }

          const message = this.telegram.formatJobMessage(job);
          const ok = await this.telegram.sendMessage(chatId, message);
          if (ok) {
            this.seenJobsStore.add(chatId, job.id);
            totalSent += 1;
            sentToThisUser += 1;
            await this.sleep(1000); // evita saturar la API de Telegram
          }
        }

        this.logger.log(
          `[chat ${chatId}] de ${allJobs.length} ofertas: ${passedFilter} pasaron el filtro, ` +
            `${alreadySeen} ya estaban vistas, ${sentToThisUser} se enviaron ahora. ` +
            `Descartadas por: remoto=${failReasons.remote}, nivel=${failReasons.level}, ` +
            `recencia=${failReasons.recency}, keyword=${failReasons.keyword}.`,
        );
      }

      this.seenJobsStore.persist();
      this.logger.log(`Listo. ${totalSent} ofertas nuevas enviadas en total (${chatIds.length} usuarios).`);
    } finally {
      this.running = false;
    }

    return { found: totalFound, sent: totalSent };
  }

  /** Dice por cuál filtro cayó una oferta, o 'pass' si pasó todos (para diagnóstico). */
  private diagnoseFilters(
    job: Job,
    cvSkills: string[],
    selectedLevels: string[],
  ): 'remote' | 'level' | 'recency' | 'keyword' | 'pass' {
    if (!isRemoteJob(job.source, job.title, job.location)) return 'remote';
    if (!matchesLevel(job.title, selectedLevels as any)) return 'level';
    if (!passesRecencyFilter(job.postedAt, this.recencyHours)) return 'recency';

    const title = job.title.toLowerCase();
    const matchesBaseKeywords = this.keywords.some((kw) => title.includes(kw));
    const matchesCv = cvSkills.length > 0 && cvSkills.some((skill) => title.includes(skill));
    if (!matchesBaseKeywords && !matchesCv) return 'keyword';

    return 'pass';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
