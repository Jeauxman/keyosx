// Local stand-in for the editorial agent. Run: node --env-file=.env scripts/mock-generator.mjs
// Receives KeyOSX's request, then posts the issue as four cumulative STAGES (outline, cover, items, media),
// a few seconds apart, as the real agent will. Every post is a DRAFT the owner approves in the admin console.
import http from "node:http";

const origin = process.env.KEYOSX_ORIGIN || "http://localhost:3000";
const delay = Number(process.env.MOCK_STAGE_DELAY_MS || 4000);
const COVER = "https://res.cloudinary.com/dmsdspzbo/image/upload/f_auto,q_auto,w_600/v1782237406/ChatGPT_Image_Jun_23_2026_11_26_10_AM_bvn7kp.png";
const VIDEO = "https://res.cloudinary.com/demo/video/upload/dog.mp4";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(job, body) {
  const response = await fetch(origin + job.callback, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.AGENT_API_TOKEN },
    body: JSON.stringify({ publication_id: job.publication_id, title: `Mock issue ${job.period_key}`, issue_date: job.issue_date, is_sample: true, ...body }),
  });
  console.log("[mock-agent]", job.publication_id, body.stage, "->", response.status);
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    res.writeHead(202).end();
    const job = JSON.parse(raw || "{}");
    const kinds = [["tip", true], ["idea", true], ["opportunity", true], ["news", false]];
    const outline = kinds.map(([kind, featured], i) => ({ kind, featured, title: `Mock ${kind} ${i + 1} for ${job.name}` }));
    const full = outline.map((item) => ({ ...item, summary: "Written by the mock agent to test staging. (Sample item.)" }));
    await post(job, { stage: "outline", items: outline });
    await sleep(delay);
    await post(job, { stage: "cover", cover_url: COVER, items: outline });
    await sleep(delay);
    await post(job, { stage: "items", cover_url: COVER, items: full });
    await sleep(delay);
    await post(job, { stage: "media", cover_url: COVER, media_url: VIDEO, items: full });
  });
}).listen(8787, () => console.log("[mock-agent] listening on 8787"));
