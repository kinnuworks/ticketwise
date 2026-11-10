// Replay scorecard. Earlier failures teach, later failures are scored.
// Teaching = one correction per distinct failure seen in the earlier part, with the
// meaning taken from the package's own source (error constant), written to Walrus Memory.
// Scoring = for every later failure, does Ticketwise answer from team knowledge (memory on)
// and with the right meaning? With memory off it never can, which is the point of the toggle.
import fs from "node:fs";
import maps from "../src/data/error-maps.json" with { type: "json" };
import { learn, recallForKey, store, type Correction } from "../src/lib/memory.ts";

const NS = "ticketwise-replay";
const replay = JSON.parse(fs.readFileSync("src/data/replay.json", "utf8"));
const items: any[] = replay.items;
const cut = items[Math.floor(items.length * 0.66)]?.checkpoint ?? 0;
const train = items.filter((i) => i.checkpoint < cut);
const test = items.filter((i) => i.checkpoint >= cut);
const pkgName: Record<string, string> = Object.fromEntries((maps as any).packages.map((p: any) => [p.key, p.name]));
const QUEUE: Record<string, string> = { deepbook: "Trading", cetus: "Trading", bluefin: "Trading" };
const entry = (i: any) => (maps as any).packages.find((p: any) => p.key === i.package)?.errors?.[i.module]?.[i.code];

const taught = new Map<string, any>();
for (const i of train) if (!taught.has(i.key) && entry(i)?.meaning) taught.set(i.key, i);

console.log(`store: ${store().mode}; train ${train.length} (${taught.size} distinct taught), test ${test.length}`);
if (process.env.TEACH !== "0") {
  for (const [key, i] of taught) {
    const have = await recallForKey(key, [NS]);
    if (have) continue;
    const e = entry(i);
    const c: Correction = {
      type: "correction", key, where: `${pkgName[i.package]} ${i.module}::${i.fn} abort ${i.code} (${e.constant})`,
      meaning: e.meaning, reply: e.meaning, queue: QUEUE[i.package] ?? "Triage", escalate: "normal",
      by: "replay teacher (labels from contract source)", on: new Date().toISOString().slice(0, 10),
    };
    const r = await learn(c, NS);
    console.log("taught", key, r.blobId);
  }
}
let hit = 0, right = 0;
const recalled = new Map<string, Awaited<ReturnType<typeof recallForKey>>>();
const perKey: Record<string, { n: number; answered: number; taughtEarlier: boolean; constant: string | null }> = {};
for (const i of test) {
  const k = (perKey[i.key] ??= { n: 0, answered: 0, taughtEarlier: taught.has(i.key), constant: entry(i)?.constant ?? null });
  k.n++;
  // One Walrus recall per distinct key (the answer depends only on the key); keeps us inside the relayer's rate limit.
  if (!recalled.has(i.key)) recalled.set(i.key, await recallForKey(i.key, [NS]));
  const r = recalled.get(i.key);
  if (r) {
    hit++;
    k.answered++;
    if (r.record.meaning === entry(i)?.meaning) right++;
  }
}
const out = {
  ranAt: new Date().toISOString(),
  store: store().mode,
  namespace: NS,
  replayBuiltAt: replay.builtAt,
  days: replay.days,
  packages: [...new Set(items.map((i) => i.package))].map((k) => pkgName[k] ?? k),
  split: { cutCheckpoint: cut, train: train.length, test: test.length },
  distinct: { all: new Set(items.map((i) => i.key)).size, taught: taught.size, test: Object.keys(perKey).length },
  withoutMemory: { answered: 0, of: test.length },
  withMemory: { answered: hit, correctMeaning: right, of: test.length },
  perKey,
};
fs.writeFileSync("src/data/scorecard.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.withMemory), JSON.stringify(out.distinct));
