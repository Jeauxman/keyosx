import { listRelationshipsForWork, listTimelineForWork, listWorks } from "./db.mjs";

const STATUS_LABELS = { old: "Old", current: "Current", future: "Future" };
const KIND_LABELS = {
  brand: "brand",
  platform: "platform",
  engine: "engine",
  ecosystem: "ecosystem",
  application: "application",
  service: "service",
  book: "book",
  document: "document",
  concept: "concept",
};

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

export function inferStatusFilter(question) {
  const text = normalize(question);
  if (/(what.?s (live|current|active|running)|current works|in rotation|today)/.test(text)) return "current";
  if (/(old|retired|dormant|legacy|superseded|past|historical|shut down)/.test(text)) return "old";
  if (/(future|planned|upcoming|not.?built|roadmap|next)/.test(text)) return "future";
  return null;
}

export function inferKindFilter(question) {
  const text = normalize(question);
  for (const kind of Object.keys(KIND_LABELS)) {
    if (new RegExp(`\\b${kind}s?\\b`).test(text)) return kind;
  }
  if (/\bapps?\b/.test(text)) return "application";
  if (/\bmanuscripts?\b/.test(text)) return "book";
  return null;
}

function relationSummary(relationships) {
  if (!relationships.length) return "";
  const labels = {
    module_of: "a module of",
    part_of_catalog: "part of",
    powered_by: "powered by",
    sibling_of: "sibling of",
    successor_of: "the successor to",
    predecessor_of: "the predecessor to",
    depends_on: "dependent on",
    inspired: "inspired by",
    licenses_to: "licensed to",
    distinct_from: "distinct from",
  };
  return relationships.slice(0, 4).map((relationship) => {
    if (relationship.direction === "outgoing") {
      return `${labels[relationship.relation_type] || relationship.relation_type} **${relationship.other_name}**`;
    }
    return `related to **${relationship.other_name}** (which is ${labels[relationship.relation_type] || relationship.relation_type} this work)`;
  }).join("; ");
}

function textForWork(work) {
  const status = STATUS_LABELS[work.status] || work.status;
  const kind = KIND_LABELS[work.kind] || work.kind;
  const detail = work.status_detail ? ` — ${work.status_detail}` : "";
  const link = work.primary_url ? ` → ${work.primary_url}` : "";
  const review = work.needs_review ? " *(compiled record — needs administrator verification)*" : "";
  return `- **${work.name}** (${kind} · ${status}${detail}). ${work.tagline || work.summary || ""}${link}${review}`;
}

export function rankWorks(works, question) {
  const words = normalize(question).split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const statusFilter = inferStatusFilter(question);
  const kindFilter = inferKindFilter(question);
  return works
    .map((work) => {
      const haystack = [work.name, work.tagline, work.summary, work.body, work.category, work.kind, ...(work.tags || [])].join(" ").toLowerCase();
      let score = words.reduce((total, word) => total + (haystack.includes(word) ? 2 : 0), 0);
      if (statusFilter && work.status === statusFilter) score += 4;
      if (kindFilter && work.kind === kindFilter) score += 3;
      return { work, score };
    })
    .sort((a, b) => b.score - a.score || a.work.name.localeCompare(b.work.name))
    .map(({ work }) => work);
}

export function findDirectMatch(works, question) {
  const text = normalize(question);
  const candidates = works.filter((work) => text.includes(normalize(work.name)) || text.includes(normalize(work.slug)));
  if (!candidates.length) return null;
  // Prefer the most specific match — e.g. "FlintBill Socratic Tutor" over "FlintBill" —
  // by picking whichever candidate's matched name/slug is longest.
  return candidates.reduce((best, work) => {
    const length = Math.max(normalize(work.name).length, normalize(work.slug).length);
    const bestLength = Math.max(normalize(best.name).length, normalize(best.slug).length);
    return length > bestLength ? work : best;
  });
}

export function article(word) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

async function buildDirectAnswer({ db, work, guideName }) {
  const relationships = await listRelationshipsForWork(db, work.id);
  const timeline = await listTimelineForWork(db, work.id);
  const status = STATUS_LABELS[work.status] || work.status;
  const kind = KIND_LABELS[work.kind] || work.kind;
  const parts = [
    `${guideName} found **${work.name}** — ${article(kind)} ${kind} currently marked **${status}**${work.status_detail ? ` (${work.status_detail})` : ""}.`,
  ];
  if (work.summary) parts.push(work.summary);
  if (work.primary_url) parts.push(`Active reference: ${work.primary_url}`);
  const relations = relationSummary(relationships);
  if (relations) parts.push(`Related works: ${relations}.`);
  if (timeline.length) {
    const latest = timeline[timeline.length - 1];
    parts.push(`Most recent timeline entry: ${latest.event_date} — ${latest.title}${latest.detail ? `: ${latest.detail}` : ""}.`);
  }
  if (work.needs_review) parts.push("*This is a compiled record from source documents — an administrator should verify it before treating it as the definitive answer.*");
  return parts.join("\n\n");
}

function buildOfflineAnswer({ question, matches, guideName, statusFilter, kindFilter }) {
  if (/^(help|what can you do|how does this work)/i.test(String(question).trim())) {
    return `${guideName} searches KeyOSX's complete published catalog of works — brands, platforms, engines, applications, books, documents, and concepts — across Old, Current, and Future status. Ask about a specific work by name, or ask things like "what's live right now", "what's planned next", or "what is FlintBill".`;
  }
  if (!matches.length) {
    const scope = statusFilter ? ` marked ${STATUS_LABELS[statusFilter]}` : kindFilter ? ` of kind ${kindFilter}` : "";
    return `${guideName} could not find a published work${scope} matching that question. Try a broader term, or ask the administrator to add or publish the record.`;
  }
  const scope = statusFilter ? ` marked **${STATUS_LABELS[statusFilter]}**` : kindFilter ? ` of kind **${kindFilter}**` : "";
  const lead = `${guideName} found ${matches.length} work${matches.length === 1 ? "" : "s"}${scope} in the catalog:`;
  return `${lead}\n\n${matches.slice(0, 6).map((work) => textForWork(work)).join("\n")}`;
}

async function askOpenAI({ question, matches, guideName }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.ASSISTANT_PROVIDER !== "openai") return null;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const catalog = matches.slice(0, 12).map((work) => ({
    name: work.name,
    kind: work.kind,
    status: work.status,
    statusDetail: work.status_detail,
    tagline: work.tagline,
    summary: work.summary,
    primaryUrl: work.primary_url,
    needsReview: work.needs_review,
  }));
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are ${guideName}, the universal search-and-retrieval guide inside KeyOSX, a master living kiosk that catalogs every work — brand, platform, engine, application, book, document, or concept — its creator has built, is building, or is planning. Answer only from the provided catalog records. Never invent a status, URL, or relationship that isn't in the records. If a record is marked needsReview, say so and note it should be verified. Use brief Markdown and name the relevant works, their status (Old/Current/Future), and where to find them.`,
        },
        { role: "user", content: `Question: ${question}\n\nCatalog records:\n${JSON.stringify(catalog)}` },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export async function askJackRabbit({ db, question, guideName = "Jack Rabbit" }) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) throw new Error("Ask Jack Rabbit a question about the catalog first.");
  if (cleanQuestion.length > 600) throw new Error("Please keep questions to 600 characters or fewer.");
  const allWorks = await listWorks(db, { includeUnpublished: false, limit: 500 });

  const direct = findDirectMatch(allWorks, cleanQuestion);
  if (direct) {
    return {
      answer: await buildDirectAnswer({ db, work: direct, guideName }),
      matches: [direct],
      provider: "offline",
    };
  }

  const statusFilter = inferStatusFilter(cleanQuestion);
  const kindFilter = inferKindFilter(cleanQuestion);
  let scoped = allWorks;
  if (statusFilter) scoped = scoped.filter((work) => work.status === statusFilter);
  if (kindFilter) scoped = scoped.filter((work) => work.kind === kindFilter);
  const matches = rankWorks(scoped.length ? scoped : allWorks, cleanQuestion).slice(0, 8);

  let answer = null;
  try {
    answer = await askOpenAI({ question: cleanQuestion, matches, guideName });
  } catch {
    answer = null;
  }
  return {
    answer: answer || buildOfflineAnswer({ question: cleanQuestion, matches, guideName, statusFilter, kindFilter }),
    matches: matches.slice(0, 6),
    provider: answer ? "openai" : "offline",
  };
}
