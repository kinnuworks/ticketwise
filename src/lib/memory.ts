import { MemWal } from "@mysten-incubation/memwal";

// Everything the team teaches Ticketwise lives in Walrus Memory on Sui mainnet.
// The team namespace takes writes only from teammates (passcode). Visitors trying
// the demo write to their own sandbox namespace, so a public inbox can never
// rewrite what the team taught.

export const TEAM_NS = process.env.MEMWAL_NAMESPACE || "ticketwise";
export const sandboxNs = (visitor: string) => `ticketwise-sb-${visitor.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;

export type Correction = {
  type: "correction";
  key: string;
  where: string;
  meaning: string;
  reply: string;
  queue: string;
  escalate: "normal" | "on-call";
  by: string;
  on: string; // YYYY-MM-DD
};

export type Rule = {
  type: "rule";
  rule: "repeat_failure";
  count: number;
  escalate: "on-call";
  text: string;
  by: string;
  on: string;
};

export type MemoryRecord = Correction | Rule;

export type Recalled<T extends MemoryRecord = MemoryRecord> = {
  record: T;
  distance: number;
  blobId: string;
  namespace: string;
  createdAt: string | null;
};

const clean = (s: string) => s.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();

export function encode(r: MemoryRecord): string {
  if (r.type === "correction") {
    return [
      "Ticketwise correction",
      `key: ${r.key}`,
      `where: ${clean(r.where)}`,
      `meaning: ${clean(r.meaning)}`,
      `reply: ${clean(r.reply)}`,
      `queue: ${clean(r.queue)}`,
      `escalate: ${r.escalate}`,
      `by: ${clean(r.by)}`,
      `on: ${r.on}`,
    ].join(" | ");
  }
  return [
    "Ticketwise rule",
    `rule: ${r.rule}`,
    `count: ${r.count}`,
    `escalate: ${r.escalate}`,
    `text: ${clean(r.text)}`,
    `by: ${clean(r.by)}`,
    `on: ${r.on}`,
  ].join(" | ");
}

export function decode(text: string): MemoryRecord | null {
  const parts = text.split(" | ");
  const head = parts[0];
  const f: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const i = p.indexOf(": ");
    if (i > 0) f[p.slice(0, i)] = p.slice(i + 2);
  }
  if (head === "Ticketwise correction" && f.key && f.meaning) {
    return {
      type: "correction",
      key: f.key,
      where: f.where ?? "",
      meaning: f.meaning,
      reply: f.reply ?? "",
      queue: f.queue ?? "Triage",
      escalate: f.escalate === "on-call" ? "on-call" : "normal",
      by: f.by ?? "a teammate",
      on: f.on ?? "",
    };
  }
  if (head === "Ticketwise rule" && f.rule === "repeat_failure") {
    return {
      type: "rule",
      rule: "repeat_failure",
      count: Math.max(2, Number(f.count) || 2),
      escalate: "on-call",
      text: f.text ?? "",
      by: f.by ?? "a teammate",
      on: f.on ?? "",
    };
  }
  return null;
}

// ---------- store ----------

type RawHit = { text: string; distance: number; blob_id: string; created_at?: string | null };

interface Store {
  mode: "walrus" | "local-dev";
  remember(text: string, ns: string): Promise<{ blobId: string }>;
  recall(query: string, ns: string, limit: number): Promise<RawHit[]>;
  list(ns: string): Promise<{ blobId: string; createdAt: string | null }[]>;
  forget(ns: string): Promise<void>;
  restore(ns: string): Promise<{ restored: number; skipped: number; total: number }>;
}

class WalrusStore implements Store {
  mode = "walrus" as const;
  private client: MemWal;
  constructor() {
    this.client = MemWal.create({
      key: process.env.MEMWAL_KEY!,
      accountId: process.env.MEMWAL_ACCOUNT_ID!,
      serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
      namespace: TEAM_NS,
    });
  }
  async remember(text: string, ns: string) {
    const job = await this.client.remember(text, ns);
    const done = await this.client.waitForRememberJob(job.job_id, { timeoutMs: 45_000 } as never);
    return { blobId: (done as { blob_id?: string }).blob_id ?? "" };
  }
  async recall(query: string, ns: string, limit: number) {
    const r = await this.client.recall({ query, limit, namespace: ns } as never);
    return r.results.map((x) => ({
      text: x.text,
      distance: x.distance,
      blob_id: x.blob_id,
      created_at: (x as { created_at?: string }).created_at ?? null,
    }));
  }
  async list(ns: string) {
    const out: { blobId: string; createdAt: string | null }[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page = await this.client.listMemories({ cursor, limit: 500, namespace: ns });
      for (const m of page.memories as unknown as { blob_id: string; created_at?: string }[]) {
        out.push({ blobId: m.blob_id, createdAt: m.created_at ?? null });
      }
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return out;
  }
  async forget(ns: string) {
    // The SDK has no forget() yet; the relayer exposes it as a signed POST.
    const c = this.client as unknown as {
      signedRequest: (m: string, p: string, b: unknown, ok?: number[]) => Promise<unknown>;
    };
    await c.signedRequest("POST", "/api/forget", { namespace: ns }, [200]);
  }
  async restore(ns: string) {
    let restored = 0,
      skipped = 0,
      total = 0;
    for (let i = 0; i < 5; i++) {
      const r = await this.client.restore(ns, 100);
      restored += r.restored;
      skipped += r.skipped;
      total = r.total;
      if (!(r as { incomplete?: boolean }).incomplete) break;
    }
    return { restored, skipped, total };
  }
}

// Used only on a developer machine without Walrus keys. The UI says so.
class LocalDevStore implements Store {
  mode = "local-dev" as const;
  private rows: { text: string; ns: string; blobId: string; createdAt: string; indexed: boolean }[] = [];
  async remember(text: string, ns: string) {
    const blobId = `local-${this.rows.length + 1}`;
    // Strictly increasing timestamps, so "newest wins" never ties when two saves land in the same millisecond.
    const last = this.rows.length ? Date.parse(this.rows[this.rows.length - 1].createdAt) : 0;
    const createdAt = new Date(Math.max(Date.now(), last + 1)).toISOString();
    this.rows.push({ text, ns, blobId, createdAt, indexed: true });
    return { blobId };
  }
  async recall(query: string, ns: string, limit: number) {
    const q = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
    return this.rows
      .filter((r) => r.ns === ns && r.indexed)
      .map((r) => {
        const t = r.text.toLowerCase().split(/\W+/).filter(Boolean);
        const hit = t.filter((w) => q.has(w)).length;
        return { text: r.text, distance: 1 - hit / Math.max(q.size, 1), blob_id: r.blobId, created_at: r.createdAt };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }
  async list(ns: string) {
    return this.rows.filter((r) => r.ns === ns).map((r) => ({ blobId: r.blobId, createdAt: r.createdAt }));
  }
  async forget(ns: string) {
    this.rows.filter((r) => r.ns === ns).forEach((r) => (r.indexed = false));
  }
  async restore(ns: string) {
    const missing = this.rows.filter((r) => r.ns === ns && !r.indexed);
    missing.forEach((r) => (r.indexed = true));
    return { restored: missing.length, skipped: 0, total: this.rows.filter((r) => r.ns === ns).length };
  }
}

const g = globalThis as unknown as { __ticketwiseStore?: Store };
export function store(): Store {
  if (!g.__ticketwiseStore) {
    g.__ticketwiseStore =
      process.env.MEMWAL_KEY && process.env.MEMWAL_ACCOUNT_ID ? new WalrusStore() : new LocalDevStore();
  }
  return g.__ticketwiseStore;
}

// ---------- higher level ----------

function toRecalled(h: RawHit, ns: string): Recalled | null {
  const record = decode(h.text);
  return record ? { record, distance: h.distance, blobId: h.blob_id, namespace: ns, createdAt: h.created_at ?? null } : null;
}

function newestFirst(a: Recalled, b: Recalled) {
  return (b.createdAt ?? b.record.on).localeCompare(a.createdAt ?? a.record.on);
}

// Exact match on the failure key. Newer corrections win over older ones.
export async function recallForKey(key: string, namespaces: string[]): Promise<Recalled<Correction> | null> {
  const hits: Recalled<Correction>[] = [];
  const all = await Promise.all(namespaces.map(async (ns) => ({ ns, raw: await store().recall(`Ticketwise correction | key: ${key}`, ns, 8) })));
  for (const { ns, raw } of all) {
    for (const h of raw) {
      const r = toRecalled(h, ns);
      if (r && r.record.type === "correction" && r.record.key === key) hits.push(r as Recalled<Correction>);
    }
  }
  return hits.sort(newestFirst)[0] ?? null;
}

// Plain-language tickets without a digest: find past cases by meaning.
export const SIMILAR_MAX_DISTANCE = Number(process.env.SIMILAR_MAX_DISTANCE || 0.62);
export async function recallSimilar(text: string, namespaces: string[]): Promise<Recalled<Correction>[]> {
  const out: Recalled<Correction>[] = [];
  for (const ns of namespaces) {
    for (const h of await store().recall(text, ns, 4)) {
      const r = toRecalled(h, ns);
      if (r && r.record.type === "correction") out.push(r as Recalled<Correction>);
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.distance - b.distance)
    .filter((r) => (seen.has(r.record.key) ? false : (seen.add(r.record.key), true)))
    .slice(0, 3);
}

export async function recallRules(namespaces: string[]): Promise<Recalled<Rule>[]> {
  const out: Recalled<Rule>[] = [];
  const all = await Promise.all(
    namespaces.map(async (ns) => ({ ns, raw: await store().recall("Ticketwise rule | rule: repeat_failure escalate on-call", ns, 5) })),
  );
  for (const { ns, raw } of all) {
    for (const h of raw) {
      const r = toRecalled(h, ns);
      if (r && r.record.type === "rule") out.push(r as Recalled<Rule>);
    }
  }
  return out.sort(newestFirst);
}

export async function learn(record: MemoryRecord, ns: string) {
  const text = encode(record);
  const { blobId } = await store().remember(text, ns);
  return { blobId, text };
}
