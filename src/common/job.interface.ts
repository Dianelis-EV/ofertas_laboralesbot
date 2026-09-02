export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  /** Fecha de publicación detectada (best-effort, no todos los portales la exponen). */
  postedAt?: Date;
}
