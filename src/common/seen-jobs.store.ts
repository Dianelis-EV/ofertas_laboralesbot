import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const SEEN_JOBS_PATH = path.resolve(process.cwd(), 'data', 'seen_jobs.json');
const MAX_PER_USER = 3000; // límite de IDs guardados por usuario para no crecer infinito

@Injectable()
export class SeenJobsStore {
  private readonly logger = new Logger(SeenJobsStore.name);
  private byUser: Map<string, Set<string>>;

  constructor() {
    this.byUser = this.load();
  }

  private load(): Map<string, Set<string>> {
    try {
      if (!fs.existsSync(SEEN_JOBS_PATH)) return new Map();
      const raw = fs.readFileSync(SEEN_JOBS_PATH, 'utf-8');
      const parsed = JSON.parse(raw);

      // Compatibilidad con el formato viejo (un solo array global, sin usuarios).
      if (Array.isArray(parsed)) {
        this.logger.warn('Formato antiguo de seen_jobs.json detectado (sin usuarios). Se migrará al confirmar tu chat_id.');
        return new Map([['_legacy', new Set(parsed)]]);
      }

      const map = new Map<string, Set<string>>();
      for (const [chatId, ids] of Object.entries(parsed as Record<string, string[]>)) {
        map.set(chatId, new Set(ids));
      }
      return map;
    } catch (e) {
      this.logger.warn(`No se pudo leer seen_jobs.json: ${e}`);
      return new Map();
    }
  }

  has(chatId: string, jobId: string): boolean {
    return this.byUser.get(chatId)?.has(jobId) ?? false;
  }

  add(chatId: string, jobId: string): void {
    if (!this.byUser.has(chatId)) this.byUser.set(chatId, new Set());
    this.byUser.get(chatId)!.add(jobId);
  }

  persist(): void {
    try {
      const dir = path.dirname(SEEN_JOBS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const out: Record<string, string[]> = {};
      for (const [chatId, ids] of this.byUser.entries()) {
        let arr = Array.from(ids);
        if (arr.length > MAX_PER_USER) arr = arr.slice(arr.length - MAX_PER_USER);
        out[chatId] = arr;
      }
      fs.writeFileSync(SEEN_JOBS_PATH, JSON.stringify(out));
    } catch (e) {
      this.logger.error(`No se pudo guardar seen_jobs.json: ${e}`);
    }
  }
}
