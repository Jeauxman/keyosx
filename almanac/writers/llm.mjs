// Model-backed writer: NOT enabled. Using a paid model needs the owner's approval, because it incurs cost.
// To add one: implement plan() and answer() with the same shapes as template.mjs, call your provider inside them, and return items that obey
// the content rules (news only from the `news` list passed in, summaries original and short, exactly three featured). The engine validates
// whatever a writer returns before anything is posted, so a provider can fail safe.
export function createLlmWriter(env = process.env) {
  if (String(env.ALMANAC_ALLOW_PAID || "").toLowerCase() !== "yes") {
    throw new Error("The model-backed writer is disabled: it incurs cost and needs the owner's approval (set ALMANAC_ALLOW_PAID=yes once approved).");
  }
  throw new Error("No model provider adapter is installed yet. Implement plan() and answer() in almanac/writers/llm.mjs.");
}
