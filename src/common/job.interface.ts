export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  /** ISO 8601. Undefined si la fuente no expone fecha confiable. */
  postedAt?: string;
}
