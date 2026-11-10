import maps from "@/data/error-maps.json";
import replay from "@/data/replay.json";
import { diagnose, type Diagnosis } from "@/lib/diagnose";
import { latestCheckpoint, txsCallingPackage, type ChainTx } from "@/lib/tatum";
import { json } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

type Pkg = { key: string; name: string; addresses: string[]; hot?: string[] };
const g = globalThis as unknown as { __recent?: { at: number; items: Diagnosis[] } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUDGET_MS = 3_500; // keep the first screen fast; real replay failures fill the rest

type ReplayItem = { digest: string; key: string; timestamp: string };
// Real failed mainnet transactions collected through Tatum for the replay (newest per error first).
// Used only to top up the live list when Tatum is slow; each one is still read fresh from the chain at triage.
function fromReplay(have: Set<string>, n: number): Diagnosis[] {
  const items = [...(replay as unknown as { items: ReplayItem[] }).items].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const out: Diagnosis[] = [];
  const keys = new Set<string>();
  for (const i of items) {
    if (out.length >= n) break;
    if (have.has(i.key) || keys.has(i.key)) continue;
    keys.add(i.key);
    out.push({ digest: i.digest, key: i.key, timestamp: i.timestamp } as Diagnosis);
  }
  return out;
}

// Real failed mainnet transactions from the demo packages, read through Tatum.
// Bots call these packages constantly; we keep only failures raised inside the package itself.
export async function GET() {
  if (g.__recent && Date.now() - g.__recent.at < 10 * 60_000) return json({ cached: true, items: g.__recent.items });
  const pkgs = (maps as unknown as { packages: Pkg[] }).packages.filter((p) => p.addresses.length);
  try {
    const started = Date.now();
    const cp = await latestCheckpoint();
    const items: Diagnosis[] = [];
    // Sample a few short windows across the last ~6 hours (about 9,000 checkpoints an hour),
    // so the list covers more than whatever one bot was doing in the last few minutes.
    const windows = [0, 9_000, 27_000, 54_000].map((back) => [cp - back - 2_500, cp - back] as const);
    const perKey = new Map<string, number>();
    // Newest window first across every package, so a slow gateway still gives a mix of apps.
    const txsByPkg = new Map<Pkg, ChainTx[]>(pkgs.map((p) => [p, []]));
    outer: for (const [from, to] of windows) {
      for (const p of pkgs) {
        for (const addr of p.hot?.length ? p.hot : p.addresses.slice(-1)) {
          if (Date.now() - started > BUDGET_MS) break outer;
          // Space calls out for Tatum's per-second limit, and retry once after a rate limit.
          for (let attempt = 0; attempt < 2; attempt++) {
            await sleep(attempt ? 1_500 : 450);
            try {
              txsByPkg.get(p)!.push(...(await txsCallingPackage(addr, from, to, 50)));
              break;
            } catch {
              // Keep what we already have; one failed window should not empty the list.
            }
          }
        }
      }
    }
    for (const [p, txs] of txsByPkg) {
      const own = new Set(p.addresses.map((a) => a.toLowerCase()));
      for (const t of txs) {
        if (t.status === "SUCCESS" || !t.error?.packageAddress || !own.has(t.error.packageAddress.toLowerCase())) continue;
        const d = diagnose(t, t.digest);
        if (!d.key || (perKey.get(d.key) ?? 0) >= 2) continue;
        perKey.set(d.key, (perKey.get(d.key) ?? 0) + 1);
        items.push(d);
      }
    }
    if (items.length < 6) items.push(...fromReplay(new Set(items.map((i) => i.key!)), 6 - items.length));
    if (items.length) g.__recent = { at: Date.now(), items };
    return json({ cached: false, items });
  } catch (e) {
    if (g.__recent) return json({ cached: true, stale: true, items: g.__recent.items });
    return json({ cached: false, fallback: true, error: e instanceof Error ? e.message : "Tatum read failed", items: fromReplay(new Set(), 6) });
  }
}
