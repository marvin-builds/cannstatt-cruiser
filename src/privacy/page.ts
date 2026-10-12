/**
 * Privacy page language switch (ROADMAP 71): datenschutz.html holds a German section (id="de")
 * and an English one (id="en"). Without JavaScript both stay visible, one below the other, and
 * the DE | EN links jump to them. With it, only the section matching the hash shows.
 */
import { pageLanguage, type PageLanguage } from './language';

const LANGUAGES: readonly PageLanguage[] = ['de', 'en'];

function show(language: PageLanguage): void {
  for (const id of LANGUAGES) {
    const section = document.getElementById(id);
    if (!section) continue;
    section.hidden = id !== language;
    if (id === language) document.title = section.dataset.title ?? document.title;
  }
  document.documentElement.lang = language;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.lang-switch a')) {
    if (link.hash === `#${language}`) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}

const update = (): void => show(pageLanguage(location.hash));

update();
window.addEventListener('hashchange', update);
