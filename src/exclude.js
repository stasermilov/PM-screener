// Market exclusion rules. Certain kinds of markets are filtered out of every
// category (and out of Movers / High chance): markets about X/Twitter posts,
// Trump insults, and "will <person> say <word> during <event>" style markets.
//
// The matching is heuristic by nature, so every exclusion records the rule and
// the exact matched phrase — the "Excluded" tab surfaces these for auditing, and
// the patterns are easy to tune. Pure module (no I/O).

export const EXCLUSION_RULES = [
  {
    id: 'x-posts',
    label: 'X / Twitter post',
    patterns: [
      /\btweets?\b/i,
      /\bretweets?\b/i,
      /\btwitter\b/i,
      /\btruth\s+social\b/i,
      /\bposts?\s+on\s+(x|twitter)\b/i,
      /\bpost\s+on\s+(x|twitter)\b/i,
      /\bx\s*\(twitter\)/i,
      /\b(how many|number of)\s+(tweets|posts)\b/i,
    ],
  },
  {
    id: 'trump-insults',
    label: 'Trump insult / nickname',
    patterns: [
      /\btrump\b[^.?!]*\b(insults?|nickname|name[-\s]?call\w*)\b/i,
      /\b(insults?|nickname)\b[^.?!]*\btrump\b/i,
      /\btrump\b[^.?!]*\bcall(s|ed)?\b[^.?!]*\b(crooked|sleepy|crazy|nasty|weak|loser|lyin'?|low[-\s]?iq|failed|fake|horseface|birdbrain|tampon)\b/i,
    ],
  },
  {
    id: 'said-during-event',
    label: 'Word said during an event',
    patterns: [
      /\bhow many times will\b[^.?!]*\b(say|says|mention|mentions)\b/i,
      /\bnumber of times\b[^.?!]*\b(say|says|mention|mentions)\b/i,
      // "... say/mention ... <event>"
      /\b(say|says|said|mention|mentions|utter|utters)\b[^.?!]*\b(earnings call|all[-\s]?in\b|podcast|speech|debate|rally|interview|state of the union|press conference|keynote|hearing|briefing|address|fireside|town hall)\b/i,
      // "will/does ... say '<quoted word>'"
      /\bsay\b\s*["“'][^"”']{1,40}["”']/i,
    ],
  },
];

/**
 * Return the first matching rule for the given text, as {id, label, matched},
 * or null if nothing matches. `extraKeywords` adds a user-defined 'custom' rule
 * (case-insensitive substring match).
 */
export function classifyExclusion(text, extraKeywords = []) {
  const s = String(text || '');
  if (!s.trim()) return null;

  for (const rule of EXCLUSION_RULES) {
    for (const re of rule.patterns) {
      const m = s.match(re);
      if (m) return { id: rule.id, label: rule.label, matched: m[0].trim() };
    }
  }

  for (const kw of extraKeywords) {
    const needle = String(kw || '').trim();
    if (!needle) continue;
    const idx = s.toLowerCase().indexOf(needle.toLowerCase());
    if (idx >= 0) {
      return { id: 'custom', label: `Custom: ${needle}`, matched: s.slice(idx, idx + needle.length) };
    }
  }
  return null;
}
