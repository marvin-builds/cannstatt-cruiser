/**
 * Nickname word filter (German + English): insults, slurs, sexual, drug and
 * alcohol terms. Catches case, umlaut spellings, leetspeak digits, spaced or
 * separated letters ("f u c k", "f-u.c_k") and stretched letters ("fuuuck").
 *
 * STEMS match anywhere inside a word; short or ambiguous words are WORDS and
 * only match a whole word, so "Marsch", "Klasse" or "Kanal" stay allowed.
 * Words are split at the separators a name may contain (space - _ .); a run of
 * single letters ("b i e r") counts as one word.
 */
const STEMS = [
  // insults (de)
  'arschloch', 'hure', 'nutte', 'fotze', 'schlampe', 'wichs', 'wixer', 'fick', 'scheis', 'kacke', 'missgeburt',
  'behindert', 'spast', 'idiot', 'trottel', 'bastard', 'schwuchtel',
  // insults (en)
  'fuck', 'shit', 'bitch', 'biatch', 'cunt', 'whore', 'slut', 'asshole', 'wanker', 'twat', 'loser', 'looser', 'retard',
  'faggot', 'piss',
  // slurs and hate
  'nazi', 'hitler', 'siegheil', 'kkk', 'nigger', 'niger', 'nigga', 'neger', 'kanake',
  // sexual
  'porn', 'sex', 'penis', 'vagina', 'muschi', 'titte', 'pussy', 'nackt', 'nude', 'dildo', 'orgasm', 'blowjob', 'vergewalt',
  // drugs
  'kokain', 'cocaine', 'heroin', 'droge', 'drugs', 'kiff', 'ecstasy', 'mdma', 'cannabis', 'marihuana', 'marijuana',
  // alcohol
  'bier', 'beer', 'schnaps', 'wodka', 'vodka', 'whisky', 'whiskey', 'tequila', 'alkohol', 'alcohol', 'besoffen', 'saufen',
  'booze',
];

const WORDS = new Set([
  'arsch', 'ass', 'anal', 'anus', 'dick', 'cock', 'tit', 'tits', 'fag', 'opfer', 'depp', 'mongo', 'rape', 'heil', 'isis',
  'meth', 'weed', 'koks', 'lsd', 'crack', 'joint', 'gin', 'rum', 'wein', 'suff',
]);

/** Stems at least this long are also searched across word gaps ("Arsch Loch"). */
const LONG_STEM = 5;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };
const FOLD: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss' };

function fold(text: string): string {
  return text.toLowerCase().replace(/[äöüß]/g, (c) => FOLD[c] ?? c);
}

/** The spellings a piece of text may hide a word in: as typed, de-leeted, de-stretched. */
function spellings(text: string): string[] {
  const deLeet = text.replace(/[0-9]/g, (d) => LEET[d] ?? d);
  return [text, deLeet, collapse(text), collapse(deLeet)];
}

function collapse(text: string): string {
  return text.replace(/(.)\1+/g, '$1');
}

/** Words of the name, with runs of single characters joined ("f u c k" -> "fuck"). */
function words(name: string): string[] {
  const parts = name.split(/[ ._-]+/).filter(Boolean);
  const out: string[] = [];
  let run = '';
  for (const part of parts) {
    if (part.length === 1) {
      run += part;
      continue;
    }
    if (run) out.push(run);
    run = '';
    out.push(part);
  }
  if (run) out.push(run);
  return out;
}

export function isOffensive(name: string): boolean {
  const folded = fold(name);
  const wordSpellings = words(folded).flatMap(spellings);
  const joined = spellings(folded.replace(/[ ._-]+/g, ''));
  return (
    wordSpellings.some((w) => WORDS.has(w) || STEMS.some((s) => w.includes(s))) ||
    joined.some((j) => WORDS.has(j) || STEMS.some((s) => s.length >= LONG_STEM && j.includes(s)))
  );
}
