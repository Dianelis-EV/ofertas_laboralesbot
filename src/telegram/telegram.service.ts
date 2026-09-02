import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import { Job } from '../common/job.interface';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token: string;
  private readonly authorizedChatIds: Set<string>;
  private bot: Telegraf | null = null;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');

    // TELEGRAM_CHAT_IDS (varios, separados por coma) es lo nuevo.
    // Si no está, se cae a TELEGRAM_CHAT_ID (un solo chat) por compatibilidad.
    const multi = this.config.get<string>('TELEGRAM_CHAT_IDS', '');
    const single = this.config.get<string>('TELEGRAM_CHAT_ID', '');
    const raw = multi || single;
    this.authorizedChatIds = new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  onModuleInit() {
    if (!this.token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN no configurado. El bot no escuchará mensajes.');
      return;
    }
    if (this.authorizedChatIds.size === 0) {
      this.logger.warn('No hay TELEGRAM_CHAT_ID(S) configurado. Nadie podrá usar el bot todavía.');
    }
    this.bot = new Telegraf(this.token);

    // Seguridad: solo responde a los chats en TELEGRAM_CHAT_IDS/TELEGRAM_CHAT_ID.
    this.bot.use(async (ctx, next) => {
      const chatId = ctx.chat?.id?.toString();
      if (chatId && !this.authorizedChatIds.has(chatId)) {
        await ctx
          .reply('Este bot es privado. Pídele a quien lo administra que agregue tu chat_id.')
          .catch(() => undefined);
        return;
      }
      return next();
    });

    this.bot.launch().catch((e) => this.logger.error(`Error al iniciar el bot: ${e?.message}`));
    this.logger.log(`Bot de Telegram escuchando (polling). Usuarios autorizados: ${this.authorizedChatIds.size}.`);
  }

  onModuleDestroy() {
    this.bot?.stop('app shutdown');
  }

  getBot(): Telegraf | null {
    return this.bot;
  }

  getAuthorizedChatIds(): string[] {
    return Array.from(this.authorizedChatIds);
  }

  async sendMessage(chatId: string, text: string, extra?: object): Promise<boolean> {
    if (!this.bot) {
      this.logger.warn('Bot no inicializado.');
      return false;
    }
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...extra,
      } as any);
      return true;
    } catch (e: any) {
      this.logger.error(`Error enviando mensaje a ${chatId}: ${e?.message}`);
      return false;
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.bot) throw new Error('Bot no inicializado');
    const link = await this.bot.telegram.getFileLink(fileId);
    const resp = await axios.get(link.href, { responseType: 'arraybuffer' });
    return Buffer.from(resp.data);
  }

  formatJobMessage(job: Job): string {
    return (
      `💼 <b>${this.escape(job.title)}</b>\n` +
      `🏢 ${this.escape(job.company)}\n` +
      `📍 ${this.escape(job.location)}\n` +
      `🌐 Fuente: ${job.source.toUpperCase()}\n` +
      `🔗 ${job.url}`
    );
  }

  private escape(text: string): string {
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

export { Markup };
