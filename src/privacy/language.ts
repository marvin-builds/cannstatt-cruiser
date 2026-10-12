/** The languages the privacy page is written in; German is the default. */
export type PageLanguage = 'de' | 'en';

/** Picks the section to show from `location.hash`: only `#en` is English, anything else German. */
export function pageLanguage(hash: string): PageLanguage {
  return hash === '#en' ? 'en' : 'de';
}
