import { describe, expect, it } from 'vitest';
import { isOffensive } from '../src/word-filter';

describe('isOffensive', () => {
  it('blocks German and English insults', () => {
    for (const name of ['Arschloch', 'Du Arsch', 'Hurensohn', 'Wichser', 'Idiot', 'Bitch', 'Asshole', 'Loser 99']) {
      expect(isOffensive(name), name).toBe(true);
    }
  });

  it('blocks slurs, sexual, drug and alcohol terms', () => {
    for (const name of ['Nazi', 'Hitler88', 'Porno King', 'Sexy Sk8r', 'Titten', 'Kokain', 'Weed', 'Kiffer', 'Bier Bruder', 'Wodka', 'Besoffen']) {
      expect(isOffensive(name), name).toBe(true);
    }
  });

  it('catches case, leetspeak, spacing and stretched variants', () => {
    for (const name of ['FUCK', 'f u c k', 'f-u_c.k', 'Fuuuuck', 'Sch31ss3', 'Scheiße', 'N4z1', 'h1tl3r', 'B1tch', 'P0rn0', 'A r s c h l o c h', 'b i e r']) {
      expect(isOffensive(name), name).toBe(true);
    }
  });

  it('lets ordinary names through, also ones that hide a short bad word', () => {
    for (const name of ['Flinker Fuchs 42', 'Marsch', 'Barsch Bob', 'Kanal Ratte', 'Heilbronn', 'Klasse Lena', 'Jörg', 'Methode', 'Sk8 Queen', 'Dickie', 'Grashüpfer', 'Max_Mustermann', 'Hölle Rider']) {
      expect(isOffensive(name), name).toBe(false);
    }
  });
});
