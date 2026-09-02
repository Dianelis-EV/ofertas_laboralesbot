import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import { Job } from '../common/job.interface';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token: string;
  readonly authorizedChatId: string;
  private bot: Telegraf | null = null;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.authorizedChatId = this.config.get<string>('TELEGRAM_CHAT_ID', '');
  }

  onModuleInit() {
    if (!this.token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN no configurado. El bot no escuchará mensajes.');
      return;
    }
    this.bot = new Telegraf(this.token);

    // Seguridad: solo responde a quien configuraste como TELEGRAM_CHAT_ID.
    // Si alguien más descubre el bot y le escribe, se le avisa y se ignora.
    this.bot.use(async (ctx, next) => {
      const chatId = ctx.chat?.id?.toString();
      if (this.authorizedChatId && chatId !== this.authorizedChatId) {
        await ctx.reply('Este bot es privado.').catch(() => undefined);
        return;
      }
      return next();
    });

    // Lanza el polling. No hace falta esperar la promesa: Telegraf la resuelve
    // cuando el bot se detiene (Ctrl+C, SIGTERM), no cuando arranca.
    this.bot.launch().catch((e) => this.logger.error(`Error al iniciar el bot: ${e?.message}`));
    this.logger.log('Bot de Telegram escuchando (polling).');
  }

  onModuleDestroy() {
    this.bot?.stop('app shutdown');
  }

  /** Expone la instancia de Telegraf para que otros módulos (ej. CvModule) registren sus propios handlers. */
  getBot(): Telegraf | null {
    return this.bot;
  }

  async sendMessage(text: string, extra?: object): Promise<boolean> {
    if (!this.bot || !this.authorizedChatId) {
      this.logger.warn('Falta el bot o TELEGRAM_CHAT_ID.');
      return false;
    }
    try {
      await this.bot.telegram.sendMessage(this.authorizedChatId, text, {
        parse_mode: 'HTML',
        ...extra,
      } as any);
      return true;
    } catch (e: any) {
      this.logger.error(`Error enviando mensaje: ${e?.message}`);
      return false;
    }
  }

  /** Descarga un archivo de Telegram (ej. el PDF del CV) como Buffer. */
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

// Se re-exporta Markup para que CvService arme teclados sin importar telegraf directo
export { Markup };
