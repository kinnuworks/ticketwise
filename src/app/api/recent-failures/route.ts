import maps from "@/data/error-maps.json";
import { diagnose, type Diagnosis } from "@/lib/diagnose";
import { latestCheckpoint, txsCallingPackage } from "@/lib/tatum";
import { json } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

type Pkg = { key: string; name: string; addresses: string[]; hot?: string[] };
const g = globalThis as unknown as { __recent?: { at: number; items: Diagnosis[] } };

// Real failed mainnet transactions from the demo packages, read through Tatum.
// Bots call these packages constantly; we keep only failures raised inside the package itself.
export async function GET() {
  if (g.__recent && Date.now() - g.__recent.at < 10 * 60_000) return json({ cached: true, items: g.__recent.items });
  const pkgs = (maps as unknown as { packages: Pkg[] }).packages.filter((p) => p.addresses.length);
  try {
    const cp = await latestCheckpoint();
    const items: Diagnosis[] = [];
    for (const p of pkgs) {
      const own = new Set(p.addresses.map((a) => a.toLowerCase()));
      const txs = [];
      for (const addr of p.hot?.length ? p.hot : p.addresses.slice(-1)) {
        try {
          txs.push(...(await txsCallingPackage(addr, cp - 3000, cp, 50)));
        } catch {
          // Keep what we already have; a rate limit on one package should not empty the list.
        }
      }
      const seen = new Set<string>();
      for (const t of txs) {
        if (t.status === "SUCCESS" || !t.error?.packageAddress || !own.has(t.error.packageAddress.toLowerCase())) continue;
        const d = diagnose(t, t.digest);
        if (!d.key || seen.has(d.key)) continue;
        seen.add(d.key);
        items.push(d);
      }
    }
    if (items.length) g.__recent = { at: Date.now(), items };
    return json({ cached: false, items });
  } catch (e) {
    if (g.__recent) return json({ cached: true, stale: true, items: g.__recent.items });
    return json({ error: e instanceof Error ? e.message : "Tatum read failed", items: [] }, 502);
  }
}
