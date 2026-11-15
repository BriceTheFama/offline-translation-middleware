/**
 * Tells English from French, and nothing else.
 *
 * It is a scoring heuristic — function words, elisions, contractions, French
 * diacritics, a few spelling patterns — not a language model. It is cheap
 * enough to run on every field of every response, and built to be **quiet when
 * unsure**: a single word with no telling feature ("Phone", "Bonus", "iPhone
 * 15") returns `undefined`, and the caller falls back to the configured source
 * language. Abstaining is better than guessing: a French text fed to an
 * English-to-French model comes back as an unrelated, invented sentence.
 */

/**
 * French function words that are not also common English words. `a`, `on`,
 * `son`, `me`, `plus`, `or`, `car` and `an` are absent on purpose: they are
 * English words too.
 */
const FRENCH_WORDS = new Set(
  (
    'le la les un une des du de au aux en et ou où est sont être été avez avons ont sera était ' +
    'dans avec sans sur sous pour par chez entre depuis vers ' +
    'je tu il elle nous vous ils elles se ce cet cette ces ma mes ta tes sa ses ' +
    'notre nos votre vos leur leurs que qui quoi dont ne pas mais donc comme ' +
    'très aussi bien déjà encore tout tous toute toutes peu ' +
    'bonjour bonsoir merci bienvenue oui nouveau nouvelle deux trois'
  ).split(' '),
);

/** English function words that are not also common French words. */
const ENGLISH_WORDS = new Set(
  (
    'the and of to is are was were be been being with for from by at in into about out up off ' +
    'i you he she it we they my your our his her its their this that these those there here ' +
    'what which who when where why how has have had will would can could should do does did ' +
    'not no yes all any some more than then only just also hello welcome thanks thank please new now'
  ).split(' '),
);

// Applied to lower-cased tokens.
const FRENCH_DIACRITIC = /[àâæçéèêëîïôœùûüÿ]/;
const FRENCH_ELISION = /^(?:l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu)['’]\p{L}/u;
const ENGLISH_CONTRACTION = /\p{L}['’](?:s|t|re|ve|ll|d|m)$/u;
/**
 * Endings that are French and rarely English. The two-letter prefix keeps short
 * English words out ("veil", "fez"). `-ette`, `-esse(s)` and `-eries` are absent:
 * "cassette", "addresses", "deliveries".
 */
const FRENCH_SPELLING =
  /\p{L}(?:eaux?|eurs?|eures?|euses?|aient)$|\p{L}{2}(?:aisons?|ertes?|elles?|eils?|eilles?|ailles?|illes?|oires?|eux|aux|erie|ez)$/u;
const ENGLISH_SPELLING = /^(?:th|wh)|ght|\p{L}{3}(?:ing|y|ness|ed|ful|less|ship)$/u;
const TOKEN_SPLIT = /[^\p{L}'’]+/u;
const EDGE_APOSTROPHES = /^['’]+|['’]+$/g;

export type EnglishOrFrench = 'en' | 'fr';

/** `'en'`, `'fr'`, or `undefined` when the text gives no clear signal. */
export function detectEnglishOrFrench(text: string): EnglishOrFrench | undefined {
  let french = 0;
  let english = 0;

  for (const raw of text.toLowerCase().split(TOKEN_SPLIT)) {
    const token = raw.replace(EDGE_APOSTROPHES, '');
    if (token.length === 0) continue;

    // Function words, elisions and contractions are strong signals.
    if (FRENCH_ELISION.test(token) || FRENCH_WORDS.has(token)) french += 2;
    else if (ENGLISH_CONTRACTION.test(token) || ENGLISH_WORDS.has(token)) english += 2;

    // Spelling is a weak one: loanwords cross over ("café", "parking").
    if (FRENCH_DIACRITIC.test(token) || FRENCH_SPELLING.test(token)) french += 1;
    if (ENGLISH_SPELLING.test(token)) english += 1;
  }

  // A clear margin, or nothing: 1-0 wins, 2-1 does not, 3-1 does.
  if (french >= 2 * english + 1) return 'fr';
  if (english >= 2 * french + 1) return 'en';
  return undefined;
}
