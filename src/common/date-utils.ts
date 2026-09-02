// Patrones de fecha relativa en español e inglés, tal como aparecen en los
// portales que hacemos scraping (ej. "Hace 2 días", "2 days ago", "Hoy").
// Es "mejor esfuerzo": si el sitio cambia su texto, simplemente no se
// detectará la fecha y el job se deja pasar (ver README, sección de fechas).

const PATTERNS: Array<{ regex: RegExp; unit: 'minute' | 'hour' | 'day' | 'week' }> = [
  { regex: /hace\s+(\d+)\s*minuto/i, unit: 'minute' },
  { regex: /hace\s+(\d+)\s*hora/i, unit: 'hour' },
  { regex: /hace\s+(\d+)\s*d[ií]a/i, unit: 'day' },
  { regex: /hace\s+(\d+)\s*semana/i, unit: 'week' },
  { regex: /(\d+)\s*minute[s]?\s*ago/i, unit: 'minute' },
  { regex: /(\d+)\s*hour[s]?\s*ago/i, unit: 'hour' },
  { regex: /(\d+)\s*day[s]?\s*ago/i, unit: 'day' },
  { regex: /(\d+)\s*week[s]?\s*ago/i, unit: 'week' },
];

const MS_PER_UNIT: Record<string, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Busca un patrón de fecha relativa (o "hoy"/"today"/"ayer"/"yesterday") en
 * un texto libre (ej. todo el texto de una tarjeta de oferta) y devuelve la
 * fecha estimada. Devuelve null si no encuentra nada reconocible.
 */
export function extractRelativeDate(text: string): Date | null {
  const t = text.toLowerCase();

  if (/\bhoy\b|\btoday\b|justo ahora|just now/.test(t)) {
    return new Date();
  }
  if (/\bayer\b|\byesterday\b/.test(t)) {
    return new Date(Date.now() - MS_PER_UNIT.day);
  }

  for (const { regex, unit } of PATTERNS) {
    const match = t.match(regex);
    if (match) {
      const amount = parseInt(match[1], 10);
      if (!isNaN(amount)) {
        return new Date(Date.now() - amount * MS_PER_UNIT[unit]);
      }
    }
  }

  return null;
}

/** true si la fecha cae dentro de las últimas `hours` horas. */
export function isWithinHours(date: Date, hours: number): boolean {
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}

/**
 * Decide si una oferta pasa el filtro de "reciente":
 * - Si tiene postedAt y cae dentro de la ventana → pasa.
 * - Si tiene postedAt pero es más vieja → NO pasa.
 * - Si no se pudo detectar postedAt (fuente sin fecha confiable) → pasa
 *   igual, para no perder ofertas válidas por un fallo de parseo del texto.
 */
export function passesRecencyFilter(postedAt: string | undefined, hours: number): boolean {
  if (!postedAt) return true;
  const date = new Date(postedAt);
  if (isNaN(date.getTime())) return true;
  return isWithinHours(date, hours);
}
