// Collects real failed mainnet transactions for the demo packages through Tatum,
// spread across ~3 weeks, keeping only aborts raised inside each package.
// Output: src/data/replay.json
import fs from "node:fs";
import maps from "../src/data/error-maps.json" with { type: "json" };
import { latestCheckpoint, txsCallingPackage } from "../src/lib/tatum.ts";
import { diagnose } from "../src/lib/diagnose.ts";

const DAY = 216_000; // ~2.5 checkpoints a second
const DAYS = Number(process.env.DAYS || 21);
const WINDOWS = Number(process.env.WINDOWS || 30);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gap = process.env.TATUM_API_KEY ? 450 : 13_000;

const pkgs = (maps as any).packages.filter((p: any) => p.addresses.length && Object.keys(p.errors).length);
const cp = await latestCheckpoint();
const out: any[] = [];
for (const p of pkgs) {
  const own = new Set(p.addresses.map((a: string) => a.toLowerCase()));
  for (let i = 0; i < WINDOWS; i++) {
    const end = cp - Math.floor((i * DAYS * DAY) / WINDOWS) - 50;
    const start = end - 400;
    for (const addr of p.addresses.slice(0, 3)) {
      try {
        const txs = await txsCallingPackage(addr, start, end, 50);
        for (const t of txs) {
          if (t.status === "SUCCESS" || !t.error?.packageAddress || !own.has(t.error.packageAddress.toLowerCase())) continue;
          const d = diagnose(t, t.digest);
          if (d.kind !== "move_abort") continue;
          out.push({ package: p.key, digest: t.digest, checkpoint: t.checkpoint, timestamp: t.timestamp, key: d.key, module: d.module, fn: d.fn, code: d.code, constant: d.sourceEntry?.constant ?? null, sender: t.sender });
        }
      } catch (e) {
        console.error(p.key, i, (e as Error).message);
        await sleep(5000);
      }
      await sleep(gap);
    }
    process.stdout.write(`${p.key} window ${i + 1}/${WINDOWS}: ${out.filter((o) => o.package === p.key).length} failures\n`);
  }
}
const uniq = [...new Map(out.map((o) => [o.digest, o])).values()].sort((a, b) => a.checkpoint - b.checkpoint);
fs.writeFileSync("src/data/replay.json", JSON.stringify({ builtAt: new Date().toISOString(), latestCheckpoint: cp, days: DAYS, items: uniq }, null, 1));
console.log("total", uniq.length, "distinct keys", new Set(uniq.map((u) => u.key)).size);
