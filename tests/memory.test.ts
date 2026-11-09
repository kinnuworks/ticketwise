import { describe, expect, it } from "vitest";
import { decode, encode, recallForKey, learn, recallSimilar, type Correction } from "@/lib/memory";

const c: Correction = {
  type: "correction",
  key: "deepbook::big_vector#5",
  where: "DeepBook v3 big_vector::leaf_remove",
  meaning: "The order you tried to cancel was already filled | or cancelled.",
  reply: "Refresh your open orders and try again.",
  queue: "Trading",
  escalate: "normal",
  by: "Maya (demo)",
  on: "2026-11-10",
};

describe("memory records", () => {
  it("round-trips a correction and strips separators from free text", () => {
    const back = decode(encode(c)) as Correction;
    expect(back.key).toBe(c.key);
    expect(back.queue).toBe("Trading");
    expect(back.meaning).not.toContain(" | ");
  });
  it("round-trips a repeat-failure rule", () => {
    const r = decode(encode({ type: "rule", rule: "repeat_failure", count: 3, escalate: "on-call", text: "Third failure in a day goes to on-call", by: "Sam (demo)", on: "2026-11-10" }));
    expect(r).toMatchObject({ type: "rule", count: 3 });
  });
  it("ignores text that is not a Ticketwise record", () => {
    expect(decode("User prefers dark mode")).toBeNull();
  });
});

describe("local store learning loop", () => {
  it("recalls the newest correction for an exact key and finds it by meaning", async () => {
    await learn(c, "test-ns");
    await learn({ ...c, queue: "Support", on: "2026-11-11" }, "test-ns");
    const hit = await recallForKey(c.key, ["test-ns"]);
    expect(hit?.record.queue).toBe("Support");
    const sim = await recallSimilar("order already filled cancel", ["test-ns"]);
    expect(sim[0]?.record.key).toBe(c.key);
    expect(await recallForKey("deepbook::pool#1", ["test-ns"])).toBeNull();
  });
});
