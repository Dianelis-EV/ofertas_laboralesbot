/**
 * Los portales de empleo casi nunca exponen una fecha ISO completa en el
 * listado: muestran texto relativo ("Hace 2 horas", "3 days ago", "Hoy").
 * Esta función intenta convertir ese texto (ES/EN) en una fecha real para
 * poder filtrar por antigüedad.
 */
export function parseRelativeDate(text: string, now: Date = new Date()): Date | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().trim();

  if (/\b(hoy|today|just posted|just now|recién publicad[oa]|recien publicad[oa])\b/.test(t)) {
    return now;
  }
  if (/\b(ayer|yesterday)\b/.test(t)) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const esMatch = t.match(/hace\s+(\d+)\s*(minutos?|min|horas?|h|d[ií]as?|semanas?|meses?)\b/);
  const enMatch = t.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?|h|days?|d|weeks?|w|months?|mo)\s+ago\b/);
  const m = esMatch || enMatch;
  if (m) {
    const value = parseInt(m[1], 10);
    const ms = unitToMs(m[2]);
    if (!Number.isNaN(value) && ms) {
      return new Date(now.getTime() - value * ms);
    }
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  return undefined;
}

function unitToMs(unit: string): number {
  if (/^min/.test(unit)) return 60 * 1000;
  if (/^h/.test(unit)) return 60 * 60 * 1000;
  if (/^d/.test(unit)) return 24 * 60 * 60 * 1000;
  if (/^(sem|week|w)/.test(unit)) return 7 * 24 * 60 * 60 * 1000;
  if (/^(mes|month|mo)/.test(unit)) return 30 * 24 * 60 * 60 * 1000;
  return 0;
}

/** true si `date` cae dentro de las últimas `hours` horas (con 5 min de tolerancia a futuro por desfases de reloj). */
export function isWithinHours(date: Date | undefined, hours: number, now: Date = new Date()): boolean {
  if (!date) return false;
  const diffMs = now.getTime() - date.getTime();
  return diffMs <= hours * 60 * 60 * 1000 && diffMs >= -5 * 60 * 1000;
}
