// Learning curve: the replay played forward one day at a time, against Walrus Memory.
// Each day's tickets are answered only from corrections taught on earlier days. At the end of
// the day, the team teaches one correction for each error it saw for the first time that day
// (meaning taken from the contract source). Starts from an empty namespace, so day 1 is 0%.
// This answers "was 226 of 226 guaranteed?": it shows how fast coverage builds from nothing,
// and counts every ticket for an error nobody had taught yet as unanswered.
import fs from "node:fs";
import maps from "../src/data/error-maps.json" with { type: "json" };
import { learn, recallForKey, store, type Correction } from "../src/lib/memory.ts";

const NS = process.env.CURVE_NS || `ticketwise-curve-${new Date().toISOString().slice(0, 10)}`;
const replay = JSON.parse(fs.readFileSync("src/data/replay.json", "utf8"));
const items: any[] = [...replay.items].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
const pkgName: Record<string, string> = Object.fromEntries((maps as any).packages.map((p: any) => [p.key, p.name]));
const QUEUE: Record<string, string> = { deepbook: "Trading", cetus: "Trading", bluefin: "Trading" };
const entry = (i: any) => (maps as any).packages.find((p: any) => p.key === i.package)?.errors?.[i.module]?.[i.code];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const days = new Map<string, any[]>();
for (const i of items) {
  const d = i.timestamp.slice(0, 10);
  if (!days.has(d)) days.set(d, []);
  days.get(d)!.push(i);
}

console.log(`store: ${store().mode}; namespace ${NS}; ${items.length} tickets over ${days.size} days`);
const taught = new Set<string>();
const out: any[] = [];
let cumTickets = 0,
  cumAnswered = 0;

for (const [day, list] of days) {
  // Answer the day's tickets from Walrus Memory: one recall per distinct error that day.
  const keys = [...new Set(list.map((i) => i.key))];
  const hit = new Map<string, boolean>();
  for (const k of keys) {
    const r = await recallForKey(k, [NS]);
    hit.set(k, !!r);
    await sleep(1100); // stay well inside the relayer's per-minute limit
  }
  const answered = list.filter((i) => hit.get(i.key)).length;
  cumTickets += list.length;
  cumAnswered += answered;

  // End of day: teach each error seen for the first time today.
  const fresh = keys.filter((k) => !taught.has(k));
  for (const k of fresh) {
    const i = list.find((x) => x.key === k)!;
    const e = entry(i);
    if (!e?.meaning) continue;
    const c: Correction = {
      type: "correction", key: k, where: `${pkgName[i.package]} ${i.module}::${i.fn} abort ${i.code} (${e.constant})`,
      meaning: e.meaning, reply: e.meaning, queue: QUEUE[i.package] ?? "Triage", escalate: "normal",
      by: "curve teacher (labels from contract source)", on: day,
    };
    await learn(c, NS);
    taught.add(k);
    await sleep(1500);
  }

  const row = { day, tickets: list.length, answered, newErrors: fresh.length, taughtSoFar: taught.size, pct: Math.round((100 * answered) / list.length) };
  out.push(row);
  console.log(JSON.stringify(row));
}

const result = {
  ranAt: new Date().toISOString(),
  store: store().mode,
  namespace: NS,
  days: out,
  total: { tickets: cumTickets, answered: cumAnswered, pct: Math.round((100 * cumAnswered) / cumTickets) },
  distinctErrors: taught.size,
};
fs.writeFileSync("src/data/curve.json", JSON.stringify(result, null, 1));
console.log("total", JSON.stringify(result.total), "errors taught", taught.size);
