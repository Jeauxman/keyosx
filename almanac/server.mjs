// The shared Almanac service. Run: node --env-file=.env almanac/server.mjs   (npm run almanac)
// KeyOSX's ISSUE_GENERATOR_URL points here. One process serves every publication; profiles decide what each one is.
import http from "node:http";
import { createEngine } from "./engine.mjs";
import { canCompose, loadEntities, loadProfile } from "./profiles.mjs";

const port = Number(process.env.ALMANAC_PORT || 8787);
const token = process.env.AGENT_API_TOKEN || "";
const engine = createEngine();

const send = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const entities = loadEntities();
    const ready = entities.publications.map((p) => loadProfile(p.id, entities)).filter((profile) => canCompose(profile)).map((profile) => profile.id);
    return send(res, 200, { ok: true, writer: engine.writerName, spend_today: engine.spend(), ready_publications: ready });
  }
  if (req.method !== "POST") return send(res, 404, { error: "not found" });
  if (!token) return send(res, 503, { error: "AGENT_API_TOKEN is not configured on the Almanac service." });
  if (req.headers.authorization !== "Bearer " + token) return send(res, 401, { error: "bad or missing bearer token" });

  let raw = "";
  req.on("data", (chunk) => { raw += chunk; if (raw.length > 100000) req.destroy(); });
  req.on("end", () => {
    let job;
    try { job = JSON.parse(raw || "{}"); } catch { return send(res, 400, { error: "JSON required" }); }
    if (!job.publication_id || !job.period_key) return send(res, 400, { error: "publication_id and period_key are required" });
    // Refuse honestly and synchronously when there is nothing real to compose from; KeyOSX records the reason as a failed request.
    const ready = engine.readiness(job.publication_id);
    if (!ready.ok) return send(res, ready.status, { error: ready.reason });
    send(res, 202, { accepted: true });
    engine.handle(job).catch((error) => console.error("[almanac] job failed:", error.message));
  });
}).listen(port, () => console.log(`[almanac] shared engine listening on ${port}, writer=${engine.writerName}`));
