import githubShortcodes from "emojibase-data/en/shortcodes/github.json";

type ShortcodesDataset = Record<string, string | string[]>;
const EMOJI_RECENTS_STORAGE_KEY = "datchat.emojiRecents";
const MAX_RECENT_EMOJIS = 40;

/**
 * Build shortcode mappings from emojibase-data (GitHub preset).
 * This keeps data source centralized and avoids hardcoding emoji lists.
 */
function hexcodeToUnicode(hexcode: string): string {
  const codePoints = hexcode
    .split("-")
    .map((part) => Number.parseInt(part, 16))
    .filter((value) => Number.isFinite(value));

  if (!codePoints.length) return "";
  return String.fromCodePoint(...codePoints);
}

function normalizeShortcode(name: string): string {
  return name.trim().toLowerCase();
}

const shortcodeDataset = githubShortcodes as ShortcodesDataset;

export const EMOJI_MAP: Record<string, string> = {};
const PRIMARY_SHORTCODE_BY_EMOJI = new Map<string, string>();

for (const [hexcode, shortcodes] of Object.entries(shortcodeDataset)) {
  const unicode = hexcodeToUnicode(hexcode);
  if (!unicode) continue;

  const names = Array.isArray(shortcodes) ? shortcodes : [shortcodes];

  for (const name of names) {
    const normalized = normalizeShortcode(name);
    if (!/^[a-z0-9_+-]+$/.test(normalized)) continue;

    const shortcode = `:${normalized}:`;
    if (!EMOJI_MAP[shortcode]) {
      EMOJI_MAP[shortcode] = unicode;
    }
    if (!PRIMARY_SHORTCODE_BY_EMOJI.has(unicode)) {
      PRIMARY_SHORTCODE_BY_EMOJI.set(unicode, shortcode);
    }
  }
}

export interface EmojiShortcodeMatch {
  shortcode: string;
  emoji: string;
  name: string;
}

const EMOJI_MATCHES: EmojiShortcodeMatch[] = Object.entries(EMOJI_MAP)
  .map(([shortcode, emoji]) => ({
    shortcode,
    emoji,
    name: shortcode.slice(1, -1),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

let cachedRecentShortcodes: string[] | null = null;

function readRecentShortcodes(): string[] {
  if (cachedRecentShortcodes) {
    return cachedRecentShortcodes;
  }

  if (typeof window === "undefined") {
    cachedRecentShortcodes = [];
    return cachedRecentShortcodes;
  }

  try {
    const raw = window.localStorage.getItem(EMOJI_RECENTS_STORAGE_KEY);
    if (!raw) {
      cachedRecentShortcodes = [];
      return cachedRecentShortcodes;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedRecentShortcodes = [];
      return cachedRecentShortcodes;
    }

    cachedRecentShortcodes = parsed
      .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
      .filter((value) => value.length > 2 && value.startsWith(":") && value.endsWith(":"));
    return cachedRecentShortcodes;
  } catch {
    cachedRecentShortcodes = [];
    return cachedRecentShortcodes;
  }
}

function writeRecentShortcodes(shortcodes: string[]) {
  cachedRecentShortcodes = shortcodes.slice(0, MAX_RECENT_EMOJIS);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    EMOJI_RECENTS_STORAGE_KEY,
    JSON.stringify(cachedRecentShortcodes)
  );
}

function compactToken(input: string): string {
  return input.replace(/[_-]/g, "");
}

function scoreCandidate(name: string, query: string) {
  const compactName = compactToken(name);
  const compactQuery = compactToken(query);

  const prefixScore = name.startsWith(query) ? 0 : 1;
  const compactPrefixScore = compactName.startsWith(compactQuery) ? 0 : 1;
  const containsIndex = name.indexOf(query);
  const compactContainsIndex = compactName.indexOf(compactQuery);

  return {
    prefixScore,
    compactPrefixScore,
    containsIndex: containsIndex === -1 ? Number.MAX_SAFE_INTEGER : containsIndex,
    compactContainsIndex:
      compactContainsIndex === -1 ? Number.MAX_SAFE_INTEGER : compactContainsIndex,
  };
}

export function recordEmojiShortcodeUsage(shortcode: string) {
  const normalized = normalizeShortcode(shortcode).replace(/^:|:$/g, "");
  if (!normalized) return;

  const key = `:${normalized}:`;
  if (!EMOJI_MAP[key]) return;

  const existing = readRecentShortcodes().filter((entry) => entry !== key);
  writeRecentShortcodes([key, ...existing]);
}

export function recordEmojiUsageByCharacter(emoji: string) {
  const shortcode = PRIMARY_SHORTCODE_BY_EMOJI.get(emoji);
  if (!shortcode) return;
  recordEmojiShortcodeUsage(shortcode);
}

/**
 * Replace :shortcode: with emoji.
 */
export function replaceEmojiShortcodes(text: string): string {
  return text.replace(/:([a-z0-9_+-]+):/gi, (match, shortcode) => {
    const key = `:${shortcode.toLowerCase()}:`;
    return EMOJI_MAP[key] ?? match;
  });
}

/**
 * Find active shortcode query before caret.
 * Example: "hello :sku" with caret at end => query "sku".
 */
export function findEmojiShortcodeQuery(
  text: string,
  caretPosition: number
): { start: number; end: number; query: string } | null {
  if (caretPosition < 0 || caretPosition > text.length) return null;

  const beforeCaret = text.slice(0, caretPosition);
  const start = beforeCaret.lastIndexOf(":");
  if (start < 0) return null;

  const rawQuery = beforeCaret.slice(start + 1);
  if (!rawQuery) return null;
  if (/[\s:]/.test(rawQuery)) return null;
  if (!/^[a-z0-9_+-]+$/i.test(rawQuery)) return null;

  const previousChar = start > 0 ? beforeCaret[start - 1] : "";
  if (previousChar && /[a-z0-9_+-]/i.test(previousChar)) return null;

  return { start, end: caretPosition, query: rawQuery.toLowerCase() };
}

/**
 * Find shortcode matches by query.
 * Prefix matches rank first, then shorter names, then alphabetical.
 */
export function getEmojiShortcodeMatches(
  query: string,
  limit = 6
): EmojiShortcodeMatch[] {
  const normalizedQuery = query.trim().toLowerCase().replace(/^:/, "");
  if (!normalizedQuery) return [];

  const recentIndexByShortcode = new Map<string, number>();
  readRecentShortcodes().forEach((shortcode, index) => {
    if (!recentIndexByShortcode.has(shortcode)) {
      recentIndexByShortcode.set(shortcode, index);
    }
  });

  return EMOJI_MATCHES
    .filter((candidate) => {
      if (candidate.name.includes(normalizedQuery)) return true;
      return compactToken(candidate.name).includes(compactToken(normalizedQuery));
    })
    .sort((a, b) => {
      const aRecent = recentIndexByShortcode.get(a.shortcode) ?? Number.MAX_SAFE_INTEGER;
      const bRecent = recentIndexByShortcode.get(b.shortcode) ?? Number.MAX_SAFE_INTEGER;
      if (aRecent !== bRecent) return aRecent - bRecent;

      const aScore = scoreCandidate(a.name, normalizedQuery);
      const bScore = scoreCandidate(b.name, normalizedQuery);

      if (aScore.prefixScore !== bScore.prefixScore) {
        return aScore.prefixScore - bScore.prefixScore;
      }
      if (aScore.compactPrefixScore !== bScore.compactPrefixScore) {
        return aScore.compactPrefixScore - bScore.compactPrefixScore;
      }
      if (aScore.containsIndex !== bScore.containsIndex) {
        return aScore.containsIndex - bScore.containsIndex;
      }
      if (aScore.compactContainsIndex !== bScore.compactContainsIndex) {
        return aScore.compactContainsIndex - bScore.compactContainsIndex;
      }
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
