// D§3.11 / SPEC S7: shared search text processing (index builder and in-browser query must agree).

/** Lowercase, fold diacritics (NFKD minus combining marks), unify apostrophes. */
export function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[’ʼ]/g, "'").toLowerCase();
}

const WORD = /[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu;

/** Words of a text after folding, with possessive endings removed ("Jesus'" → "jesus", "Lord's" → "lord"). */
export function words(text: string): string[] {
  return (fold(text).match(WORD) ?? []).map((w) => w.replace(/'s$/, "").replace(/'/g, ""));
}

const isVowel = (w: string, i: number): boolean => {
  const c = w[i]!;
  return "aeiou".includes(c) || (c === "y" && i > 0 && !isVowel(w, i - 1));
};
const hasVowel = (w: string) => [...w].some((_, i) => isVowel(w, i));
/** Porter "m": number of VC sequences. */
function measure(w: string): number {
  let m = 0;
  let prevV = false;
  for (let i = 0; i < w.length; i++) {
    const v = isVowel(w, i);
    if (!v && prevV) m++;
    prevV = v;
  }
  return m;
}
const cvc = (w: string) => {
  const n = w.length;
  return n >= 3 && !isVowel(w, n - 1) && isVowel(w, n - 2) && !isVowel(w, n - 3) && !"wxy".includes(w[n - 1]!);
};

/**
 * Small English stemmer: Porter steps 1a–1b (plurals, -ed, -ing). Enough for SPEC S7 ("loved" ↔ "love")
 * while keeping KJV forms ("loveth", "lovest") distinct, which readers search for literally.
 */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  if (w.endsWith("eed")) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
    return w;
  }
  for (const suf of ["ed", "ing"]) {
    if (!w.endsWith(suf)) continue;
    const base = w.slice(0, -suf.length);
    if (!hasVowel(base)) return w;
    w = base;
    if (/(at|bl|iz)$/.test(w)) return w + "e";
    if (/([^aeiouylsz])\1$/.test(w)) return w.slice(0, -1);
    if (measure(w) === 1 && cvc(w)) return w + "e";
    return w;
  }
  return w;
}

/** Index/query terms of a text. */
export function terms(text: string): string[] {
  return words(text).map(stem);
}

/**
 * Function words left out of the index (P3.1 spike: −35% index size and better ranking). Quoted
 * phrases still match them through the exact-phrase filter over verse text.
 */
export const STOPWORDS: ReadonlySet<string> = new Set(
  "a an and are as at be but by for from he her him his i in is it its me my not of on or our she so that the their them then there they this to was we were what which who will with ye you your thou thee thy unto shall".split(" "),
);

/** Terms stored in / looked up from the index. */
export function indexTerms(text: string): string[] {
  return terms(text).filter((t) => !STOPWORDS.has(t));
}

/** Share of adjacent query-word pairs found adjacent and in order in the verse (0..1), for re-ranking. */
export function adjacency(queryWords: readonly string[], verseWords: readonly string[]): number {
  if (queryWords.length < 2) return 0;
  const pairs = new Set(verseWords.slice(1).map((w, i) => `${verseWords[i]} ${w}`));
  let n = 0;
  for (let i = 1; i < queryWords.length; i++) if (pairs.has(`${queryWords[i - 1]} ${queryWords[i]}`)) n++;
  return n / (queryWords.length - 1);
}
