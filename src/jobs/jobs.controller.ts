import { Controller, Get, Post } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller()
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // Endpoint de salud. Además de confirmar que el servicio está vivo, sirve
  // para que un ping externo (ver README, sección "keep-alive") evite que
  // hostings gratuitos como Render dejen dormir el servicio.
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Permite disparar una búsqueda manualmente (útil para probar sin esperar
  // al cron): POST /jobs/run
  @Post('jobs/run')
  async runNow() {
    return this.jobsService.runSearch();
  }
}
