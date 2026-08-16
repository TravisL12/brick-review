/** Words people sprinkle through a pasted list that carry no set number. */
const NOISE_WORDS = new Set(['lego', 'set', 'sets', 'no', 'num', 'number', 'id', 'item', 'qty', 'x']);

export function isNoiseToken(raw: string): boolean {
  return NOISE_WORDS.has(raw.trim().replace(/[^A-Za-z]/g, '').toLowerCase()) &&
    !/\d/.test(raw);
}

/**
 * Rebrickable set numbers always carry a variant suffix ("10276" -> "10276-1").
 * Users type them every which way, so normalise aggressively.
 */
export function normalizeSetNum(raw: string): string | null {
  let token = raw.trim();
  if (!token) return null;

  // Drop decoration people paste along with the number.
  token = token.replace(/^[#"'`(\[]+/, '').replace(/[)"'`\]]+$/, '');
  token = token.replace(/^lego[\s:-]+/i, '');
  token = token.trim();
  if (!token) return null;

  // Only letters, digits and a single dash-separated variant are meaningful.
  if (!/^[A-Za-z0-9]+(-\d+)?$/.test(token)) return null;

  // Every real set number contains a digit; a bare word is a stray label.
  if (!/\d/.test(token)) return null;

  const upper = /^[a-z]/i.test(token) ? token.toUpperCase() : token;
  return /-\d+$/.test(upper) ? upper : `${upper}-1`;
}

export interface ParsedSetNums {
  setNums: string[];
  invalid: string[];
}

/**
 * Accepts a free-form blob: newlines, commas, semicolons, tabs or spaces.
 * Returns de-duplicated canonical set numbers plus whatever could not be parsed.
 */
export function parseSetNumList(input: string): ParsedSetNums {
  const tokens = input
    .split(/[\s,;|]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const setNums: string[] = [];
  const invalid: string[] = [];

  for (const token of tokens) {
    if (isNoiseToken(token)) continue;

    const normalized = normalizeSetNum(token);
    if (!normalized) {
      invalid.push(token);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    setNums.push(normalized);
  }

  return { setNums, invalid };
}
