import { SeniorityLevel } from '../cv/cv.service';

// Fuentes que por naturaleza publican solo trabajo remoto — no hace falta
// revisar el texto de cada oferta para saber que aplica.
export const ALWAYS_REMOTE_SOURCES = new Set(['remoteok', 'weworkremotely', 'getonboard']);

const REMOTE_TERMS = [
  'remote',
  'remoto',
  'remota',
  'home office',
  'teletrabajo',
  'trabajo desde casa',
  'anywhere',
  'worldwide',
  'latam',
];

export function isRemoteJob(source: string, title: string, location: string): boolean {
  if (ALWAYS_REMOTE_SOURCES.has(source)) return true;
  const haystack = `${title} ${location}`.toLowerCase();
  return REMOTE_TERMS.some((term) => haystack.includes(term));
}

const LEVEL_TERMS: Record<SeniorityLevel, string[]> = {
  junior: ['junior', ' jr', ' jr.', 'trainee', 'entry level', 'entry-level'],
  semi: ['semi senior', 'semi-senior', 'ssr', 'mid level', 'mid-level', 'intermediate', 'semi sr'],
  senior: ['senior', ' sr', ' sr.'],
};

/**
 * Determina el nivel de una oferta según su título, si es detectable.
 * Devuelve null si el título no menciona ningún nivel (oferta "ambigua").
 */
export function detectJobLevel(title: string): SeniorityLevel | null {
  const t = ` ${title.toLowerCase()} `;
  for (const level of Object.keys(LEVEL_TERMS) as SeniorityLevel[]) {
    if (LEVEL_TERMS[level].some((term) => t.includes(term))) return level;
  }
  return null;
}

/**
 * Pasa el filtro de nivel si: no hay niveles seleccionados (sin restricción),
 * o la oferta no menciona nivel (se incluye por si acaso), o menciona un
 * nivel que sí está entre los seleccionados.
 */
export function matchesLevel(title: string, selectedLevels: SeniorityLevel[]): boolean {
  if (selectedLevels.length === 0) return true;
  const detected = detectJobLevel(title);
  if (detected === null) return true;
  return selectedLevels.includes(detected);
}
