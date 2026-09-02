import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Markup } from 'telegraf';
import { TelegramService } from '../telegram/telegram.service';
import { TECH_KEYWORDS } from './tech-keywords';

// pdf-parse no trae tipos ESM limpios; se importa así para evitar problemas de compilación.
const pdfParse = require('pdf-parse');

const CV_PATH = path.resolve(process.cwd(), 'data', 'cv.json');

export type SeniorityLevel = 'junior' | 'semi' | 'senior';

const LEVEL_LABELS: Record<SeniorityLevel, string> = {
  junior: 'Junior',
  semi: 'Semi Senior',
  senior: 'Senior',
};

export interface CvData {
  skills: string[];
  levels: SeniorityLevel[];
  updatedAt: string;
  rawTextLength: number;
}

@Injectable()
export class CvService implements OnModuleInit {
  private readonly logger = new Logger(CvService.name);
  private cache: CvData | null = null;

  // Selección de nivel "en progreso" mientras el usuario toca los botones,
  // antes de tocar "Confirmar". Se guarda en memoria (alcanza para un solo usuario).
  private pendingLevels: Set<SeniorityLevel> = new Set();

  constructor(private readonly telegram: TelegramService) {
    this.cache = this.load();
  }

  onModuleInit() {
    const bot = this.telegram.getBot();
    if (!bot) return;

    // 1) Recibir el CV en PDF
    bot.on('document', async (ctx) => {
      const doc = ctx.message.document;
      const isPdf =
        doc.mime_type === 'application/pdf' || doc.file_name?.toLowerCase().endsWith('.pdf');

      if (!isPdf) {
        await ctx.reply('Mándame tu CV en formato PDF, por favor.');
        return;
      }

      await ctx.reply('Recibí tu CV, dame un momento para analizarlo...');
      try {
        const buffer = await this.telegram.downloadFile(doc.file_id);
        const data = await this.processPdf(buffer);

        const skillsText = data.skills.length
          ? data.skills.join(', ')
          : 'no detecté tecnologías conocidas (puedes editar data/cv.json manualmente si hace falta)';

        await ctx.reply(`✅ CV analizado. Skills detectadas:\n${skillsText}`);
        await this.askSeniority(ctx);
      } catch (e: any) {
        this.logger.error(`Error procesando el CV: ${e?.message}`);
        await ctx.reply('No pude leer ese PDF. ¿Puedes intentar con otro archivo?');
      }
    });

    // 2) Comandos manuales de utilidad
    bot.command('cv', async (ctx) => {
      await ctx.reply(this.getSummary());
    });

    bot.command('niveles', async (ctx) => {
      await this.askSeniority(ctx);
    });

    // 3) Botones de selección de nivel (toggle) + confirmar
    bot.action(/lvl_toggle_(junior|semi|senior)/, async (ctx) => {
      const level = ctx.match[1] as SeniorityLevel;
      if (this.pendingLevels.has(level)) {
        this.pendingLevels.delete(level);
      } else {
        this.pendingLevels.add(level);
      }
      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(this.buildLevelKeyboard().reply_markup);
    });

    bot.action('lvl_confirm', async (ctx) => {
      if (this.pendingLevels.size === 0) {
        await ctx.answerCbQuery('Elige al menos un nivel antes de confirmar', { show_alert: true });
        return;
      }
      const levels = Array.from(this.pendingLevels);
      this.saveLevels(levels);
      await ctx.answerCbQuery('Guardado ✅');
      const labels = levels.map((l) => LEVEL_LABELS[l]).join(', ');
      await ctx.editMessageText(`Listo, voy a avisarte solo de ofertas para: ${labels}`);
    });
  }

  private async askSeniority(ctx: any): Promise<void> {
    this.pendingLevels = new Set(this.cache?.levels ?? []);
    await ctx.reply(
      '¿Para qué nivel(es) quieres que te avise? Puedes elegir 1, 2 o 3 opciones y luego tocar Confirmar.',
      this.buildLevelKeyboard(),
    );
  }

  private buildLevelKeyboard() {
    const check = (level: SeniorityLevel) => (this.pendingLevels.has(level) ? '✅ ' : '');
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(`${check('junior')}Junior`, 'lvl_toggle_junior'),
        Markup.button.callback(`${check('semi')}Semi Senior`, 'lvl_toggle_semi'),
        Markup.button.callback(`${check('senior')}Senior`, 'lvl_toggle_senior'),
      ],
      [Markup.button.callback('Confirmar ✔️', 'lvl_confirm')],
    ]);
  }

  private load(): CvData | null {
    try {
      if (!fs.existsSync(CV_PATH)) return null;
      const raw = fs.readFileSync(CV_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      this.logger.warn(`No se pudo leer cv.json: ${e}`);
      return null;
    }
  }

  hasCv(): boolean {
    return !!this.cache && this.cache.skills.length > 0;
  }

  getSkills(): string[] {
    return this.cache?.skills ?? [];
  }

  getLevels(): SeniorityLevel[] {
    return this.cache?.levels ?? [];
  }

  getSummary(): string {
    if (!this.hasCv()) return 'Todavía no tengo tu CV. Mándamelo en PDF por este chat.';
    const levels = this.getLevels();
    const levelsText = levels.length
      ? levels.map((l) => LEVEL_LABELS[l]).join(', ')
      : 'ninguno seleccionado todavía (usa /niveles)';
    return (
      `CV cargado el ${this.cache!.updatedAt}.\n` +
      `Skills detectadas (${this.cache!.skills.length}): ${this.cache!.skills.join(', ')}\n` +
      `Niveles: ${levelsText}`
    );
  }

  /**
   * Procesa el buffer de un PDF: extrae texto, detecta cuáles de las
   * TECH_KEYWORDS aparecen en el CV, y guarda el resultado en disco.
   */
  async processPdf(buffer: Buffer): Promise<CvData> {
    const parsed = await pdfParse(buffer);
    const text: string = (parsed.text || '').toLowerCase();

    const skills = TECH_KEYWORDS.filter((kw) => text.includes(kw.toLowerCase()));
    const uniqueSkills = Array.from(new Set(skills));

    const data: CvData = {
      skills: uniqueSkills,
      levels: this.cache?.levels ?? [],
      updatedAt: new Date().toISOString(),
      rawTextLength: text.length,
    };

    this.cache = data;
    this.persist(data);
    return data;
  }

  private saveLevels(levels: SeniorityLevel[]): void {
    const data: CvData = {
      skills: this.cache?.skills ?? [],
      levels,
      updatedAt: this.cache?.updatedAt ?? new Date().toISOString(),
      rawTextLength: this.cache?.rawTextLength ?? 0,
    };
    this.cache = data;
    this.persist(data);
  }

  private persist(data: CvData): void {
    try {
      const dir = path.dirname(CV_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CV_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      this.logger.error(`No se pudo guardar cv.json: ${e}`);
    }
  }
}
