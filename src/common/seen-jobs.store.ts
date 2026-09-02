import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const SEEN_JOBS_PATH = path.resolve(process.cwd(), 'data', 'seen_jobs.json');
const MAX_TOTAL = 3000; // límite total de IDs guardados para no crecer infinito

@Injectable()
export class SeenJobsStore {
  private readonly logger = new Logger(SeenJobsStore.name);
  private seenIds: Set<string>;

  constructor() {
    this.seenIds = this.load();
  }

  private load(): Set<string> {
    try {
      if (!fs.existsSync(SEEN_JOBS_PATH)) return new Set();
      const raw = fs.readFileSync(SEEN_JOBS_PATH, 'utf-8');
      const arr: string[] = JSON.parse(raw);
      return new Set(arr);
    } catch (e) {
      this.logger.warn(`No se pudo leer seen_jobs.json: ${e}`);
      return new Set();
    }
  }

  has(id: string): boolean {
    return this.seenIds.has(id);
  }

  add(id: string): void {
    this.seenIds.add(id);
  }

  persist(): void {
    try {
      const dir = path.dirname(SEEN_JOBS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let ids = Array.from(this.seenIds);
      if (ids.length > MAX_TOTAL) {
        ids = ids.slice(ids.length - MAX_TOTAL);
        this.seenIds = new Set(ids);
      }
      fs.writeFileSync(SEEN_JOBS_PATH, JSON.stringify(ids));
    } catch (e) {
      this.logger.error(`No se pudo guardar seen_jobs.json: ${e}`);
    }
  }
}
