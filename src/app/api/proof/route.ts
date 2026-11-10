import { store, TEAM_NS } from "@/lib/memory";
import { json } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const g = globalThis as unknown as { __proof?: { at: number; data: unknown } };

export async function GET() {
  if (g.__proof && Date.now() - g.__proof.at < 5 * 60_000) return json(g.__proof.data);
  try {
    const rows = await store().list(TEAM_NS);
    // Other namespaces on the same account: the replay scorecard and the durability check.
    const others = await Promise.all(
      [
        { namespace: "ticketwise-replay", what: "Replay scorecard: one correction per error, taught from the earlier failures" },
        { namespace: "ticketwise-durability", what: "Durability check: deleted from the index and restored from Walrus" },
      ].map(async (n) => ({ ...n, count: (await store().list(n.namespace).catch(() => [])).length })),
    );
    const namespaces = [{ namespace: TEAM_NS, what: "Team corrections and escalation rules used by the inbox", count: rows.length }, ...others];
    const data = {
      namespaces,
      total: namespaces.reduce((n, x) => n + x.count, 0),
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
