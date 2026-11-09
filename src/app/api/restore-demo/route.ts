import { learn, store, recallForKey } from "@/lib/memory";
import { isTeammate, json } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

// Durability check on a separate namespace: wipe the relayer's search index,
// show recall is empty, rebuild it from the blobs on Walrus, show recall works again.
const NS = "ticketwise-durability";
const KEY = "deepbook::big_vector#5";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { passcode?: string; seed?: boolean };
  if (!isTeammate(b.passcode)) return json({ error: "Teammates only: this wipes and rebuilds an index." }, 403);
  const s = store();
  const steps: { step: string; ok: boolean; detail: string; ms: number }[] = [];
  const step = async (name: string, fn: () => Promise<string>) => {
    const t = Date.now();
    try {
      steps.push({ step: name, ok: true, detail: await fn(), ms: Date.now() - t });
    } catch (e) {
      steps.push({ step: name, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Date.now() - t });
    }
  };
  if (b.seed) {
    await step("seed", async () => {
      const r = await learn(
        { type: "correction", key: KEY, where: "DeepBook v3 big_vector", meaning: "The order was already gone when the cancel arrived.", reply: "Refresh your open orders; nothing was lost.", queue: "Trading", escalate: "normal", by: "durability check", on: new Date().toISOString().slice(0, 10) },
        NS,
      );
      return `stored blob ${r.blobId}`;
    });
  }
  await step("recall before", async () => ((await recallForKey(KEY, [NS])) ? "found the correction" : "nothing found"));
  await step("forget index", async () => (await s.forget(NS), "relayer index for this namespace deleted; Walrus blobs untouched"));
  await step("recall after forget", async () => ((await recallForKey(KEY, [NS])) ? "still found (index not cleared yet)" : "nothing found"));
  await step("restore from Walrus", async () => {
    const r = await s.restore(NS);
    return `restored ${r.restored}, skipped ${r.skipped}, total ${r.total}`;
  });
  await step("recall after restore", async () => ((await recallForKey(KEY, [NS])) ? "found the correction again" : "nothing found"));
  return json({ namespace: NS, mode: s.mode, steps });
}
