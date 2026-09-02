import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Job } from '../common/job.interface';

@Injectable()
export class RemoteOkScraper {
  private readonly logger = new Logger(RemoteOkScraper.name);
  readonly sourceName = 'remoteok';

  async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    try {
      const { data } = await axios.get('https://remoteok.com/api', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
      });

      for (const item of data) {
        if (!item || typeof item !== 'object' || !item.id) continue;
        jobs.push({
          id: `remoteok-${item.id}`,
          title: item.position || 'Sin título',
          company: item.company || 'N/A',
          location: item.location || 'Remoto',
          url: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
          source: this.sourceName,
        });
      }
    } catch (e: any) {
      this.logger.warn(`Error al obtener datos: ${e?.message}`);
    }
    return jobs;
  }
}
