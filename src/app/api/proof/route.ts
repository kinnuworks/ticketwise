import { store, TEAM_NS } from "@/lib/memory";
import { json } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const g = globalThis as unknown as { __proof?: { at: number; data: unknown } };

export async function GET() {
  if (g.__proof && Date.now() - g.__proof.at < 5 * 60_000) return json(g.__proof.data);
  try {
    const rows = await store().list(TEAM_NS);
    const data = {
      mode: store().mode,
      namespace: TEAM_NS,
      account: process.env.MEMWAL_ACCOUNT_ID ?? null,
      count: rows.length,
      memories: rows
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, 100)
        .map((r) => ({ ...r, walrus: r.blobId && !r.blobId.startsWith("local-") ? `https://walruscan.com/mainnet/blob/${r.blobId}` : null })),
    };
    g.__proof = { at: Date.now(), data };
    return json(data);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Could not list memories" }, 502);
  }
}
