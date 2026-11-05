// Live sources for `news` items. News is only ever built from something retrieved this run, with its real link.
// We keep the title, link, source name and date. We do not copy article text.
const decode = (text) =>
  String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(Number(dec)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
const codePoint = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");

const tag = (block, name) => {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return match ? decode(match[1]) : "";
};

// Minimal RSS 2.0 / Atom reader. Returns [{ title, url, published }] (published = ISO date or "").
export function parseFeed(xml) {
  const blocks = String(xml || "").match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.map((block) => {
    let url = tag(block, "link");
    if (!url) {
      const atom = /<link[^>]*href=["']([^"']+)["']/i.exec(block);
      url = atom ? atom[1] : "";
    }
    const raw = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    const time = raw ? new Date(raw) : null;
    return { title: tag(block, "title"), url: url.trim(), published: time && !Number.isNaN(+time) ? time.toISOString() : "" };
  }).filter((entry) => entry.title && /^https?:\/\//.test(entry.url));
}

// Fetches the enabled feeds. A feed that fails is reported in `warnings` and skipped; it never blocks the issue.
export async function fetchNews(feeds, { fetchImpl = fetch, now = new Date(), maxAgeDays = 21, timeoutMs = 8000 } = {}) {
  const items = [];
  const warnings = [];
  const cutoff = +now - maxAgeDays * 86400000;
  for (const feed of feeds) {
    try {
      const response = await fetchImpl(feed.url, { headers: { "User-Agent": "KeyOSX-Almanac/0.1 (editorial feed reader)" }, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error("HTTP " + response.status);
      for (const entry of parseFeed(await response.text())) {
        if (!entry.published || +new Date(entry.published) < cutoff) continue; // undated or stale items are not "news"
        items.push({ ...entry, source: feed.name });
      }
    } catch (error) {
      warnings.push(`${feed.name}: ${error.message}`);
    }
  }
  const seen = new Set();
  const unique = items.filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)));
  unique.sort((a, b) => +new Date(b.published) - +new Date(a.published));
  return { items: unique, warnings };
}
