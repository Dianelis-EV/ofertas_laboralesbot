import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Markup } from 'telegraf';
import { TelegramService } from '../telegram/telegram.service';
import { TECH_KEYWORDS } from './tech-keywords';

const pdfParse = require('pdf-parse');

const CV_PATH = path.resolve(process.cwd(), 'data', 'cv_profiles.json');

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
  private profiles: Map<string, CvData>;

  // Selección de nivel "en progreso" por chat, mientras toca los botones.
  private pendingLevels: Map<string, Set<SeniorityLevel>> = new Map();

  constructor(private readonly telegram: TelegramService) {
    this.profiles = this.load();
  }

  onModuleInit() {
    const bot = this.telegram.getBot();
    if (!bot) return;

    bot.on('document', async (ctx) => {
      const chatId = ctx.chat.id.toString();
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
        const data = await this.processPdf(chatId, buffer);

        const skillsText = data.skills.length
          ? data.skills.join(', ')
          : 'no detecté tecnologías conocidas (puedes editar data/cv_profiles.json manualmente si hace falta)';

        await ctx.reply(`✅ CV analizado. Skills detectadas:\n${skillsText}`);
        await this.askSeniority(ctx, chatId);
      } catch (e: any) {
        this.logger.error(`Error procesando el CV de ${chatId}: ${e?.message}`);
        await ctx.reply('No pude leer ese PDF. ¿Puedes intentar con otro archivo?');
      }
    });

    bot.command('cv', async (ctx) => {
      await ctx.reply(this.getSummary(ctx.chat.id.toString()));
    });

    bot.command('niveles', async (ctx) => {
      await this.askSeniority(ctx, ctx.chat.id.toString());
    });

    bot.action(/lvl_toggle_(junior|semi|senior)/, async (ctx) => {
      const chatId = ctx.chat!.id.toString();
      const level = ctx.match[1] as SeniorityLevel;
      const pending = this.pendingLevels.get(chatId) ?? new Set<SeniorityLevel>();

      if (pending.has(level)) pending.delete(level);
      else pending.add(level);
      this.pendingLevels.set(chatId, pending);

      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(this.buildLevelKeyboard(chatId).reply_markup);
    });

    bot.action('lvl_confirm', async (ctx) => {
      const chatId = ctx.chat!.id.toString();
      const pending = this.pendingLevels.get(chatId) ?? new Set<SeniorityLevel>();

      if (pending.size === 0) {
        await ctx.answerCbQuery('Elige al menos un nivel antes de confirmar', { show_alert: true });
        return;
      }
      const levels = Array.from(pending);
      this.saveLevels(chatId, levels);
      await ctx.answerCbQuery('Guardado ✅');
      const labels = levels.map((l) => LEVEL_LABELS[l]).join(', ');
      await ctx.editMessageText(`Listo, voy a avisarte solo de ofertas para: ${labels}`);
    });
  }

  private async askSeniority(ctx: any, chatId: string): Promise<void> {
    this.pendingLevels.set(chatId, new Set(this.profiles.get(chatId)?.levels ?? []));
    await ctx.reply(
      '¿Para qué nivel(es) quieres que te avise? Puedes elegir 1, 2 o 3 opciones y luego tocar Confirmar.',
      this.buildLevelKeyboard(chatId),
    );
  }

  private buildLevelKeyboard(chatId: string) {
    const pending = this.pendingLevels.get(chatId) ?? new Set<SeniorityLevel>();
    const check = (level: SeniorityLevel) => (pending.has(level) ? '✅ ' : '');
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(`${check('junior')}Junior`, 'lvl_toggle_junior'),
        Markup.button.callback(`${check('semi')}Semi Senior`, 'lvl_toggle_semi'),
        Markup.button.callback(`${check('senior')}Senior`, 'lvl_toggle_senior'),
      ],
      [Markup.button.callback('Confirmar ✔️', 'lvl_confirm')],
    ]);
  }

  private load(): Map<string, CvData> {
    try {
      if (!fs.existsSync(CV_PATH)) return new Map();
      const raw = fs.readFileSync(CV_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return new Map(Object.entries(parsed));
    } catch (e) {
      this.logger.warn(`No se pudo leer cv_profiles.json: ${e}`);
      return new Map();
    }
  }

  hasCv(chatId: string): boolean {
    const data = this.profiles.get(chatId);
    return !!data && data.skills.length > 0;
  }

  getSkills(chatId: string): string[] {
    return this.profiles.get(chatId)?.skills ?? [];
  }

  getLevels(chatId: string): SeniorityLevel[] {
    return this.profiles.get(chatId)?.levels ?? [];
  }

  getSummary(chatId: string): string {
    if (!this.hasCv(chatId)) return 'Todavía no tengo tu CV. Mándamelo en PDF por este chat.';
    const data = this.profiles.get(chatId)!;
    const levels = this.getLevels(chatId);
    const levelsText = levels.length
      ? levels.map((l) => LEVEL_LABELS[l]).join(', ')
      : 'ninguno seleccionado todavía (usa /niveles)';
    return (
      `CV cargado el ${data.updatedAt}.\n` +
      `Skills detectadas (${data.skills.length}): ${data.skills.join(', ')}\n` +
      `Niveles: ${levelsText}`
    );
  }

  async processPdf(chatId: string, buffer: Buffer): Promise<CvData> {
    const parsed = await pdfParse(buffer);
    const text: string = (parsed.text || '').toLowerCase();

    const skills = TECH_KEYWORDS.filter((kw) => text.includes(kw.toLowerCase()));
    const uniqueSkills = Array.from(new Set(skills));

    const data: CvData = {
      skills: uniqueSkills,
      levels: this.profiles.get(chatId)?.levels ?? [],
      updatedAt: new Date().toISOString(),
      rawTextLength: text.length,
    };

    this.profiles.set(chatId, data);
    this.persist();
    return data;
  }

  private saveLevels(chatId: string, levels: SeniorityLevel[]): void {
    const existing = this.profiles.get(chatId);
    const data: CvData = {
      skills: existing?.skills ?? [],
      levels,
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
      rawTextLength: existing?.rawTextLength ?? 0,
    };
    this.profiles.set(chatId, data);
    this.persist();
  }

  private persist(): void {
    try {
      const dir = path.dirname(CV_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const out = Object.fromEntries(this.profiles.entries());
      fs.writeFileSync(CV_PATH, JSON.stringify(out, null, 2));
    } catch (e) {
      this.logger.error(`No se pudo guardar cv_profiles.json: ${e}`);
    }
  }
}
