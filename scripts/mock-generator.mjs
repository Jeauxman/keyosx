// Local stand-in for the Codex editorial agent. Run: node --env-file=.env scripts/mock-generator.mjs
// Receives KeyOSX's request, then posts a SAMPLE issue back, proving the loop works end to end.
import http from "node:http";

const origin = process.env.KEYOSX_ORIGIN || "http://localhost:3000";
http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    res.writeHead(202).end();
    const job = JSON.parse(body || "{}");
    console.log("[mock-agent] request:", job.publication_id, job.period_key);
    const response = await fetch(origin + job.callback, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.AGENT_API_TOKEN },
      body: JSON.stringify({
        publication_id: job.publication_id, title: `Mock issue ${job.period_key}`, issue_date: job.issue_date, status: "published", is_sample: true,
        items: [["tip", true], ["idea", true], ["opportunity", true], ["news", false]].map(([kind, featured], i) => ({ kind, featured, title: `Mock ${kind} ${i + 1} for ${job.name}`, summary: "Posted by the mock agent to test the loop. (Sample item.)" })),
      }),
    });
    console.log("[mock-agent] posted ->", response.status);
  });
}).listen(8787, () => console.log("[mock-agent] listening on 8787"));
