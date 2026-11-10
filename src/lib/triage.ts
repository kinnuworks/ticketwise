import { diagnose, extractRefs, type Diagnosis } from "./diagnose";
import { getTransaction, latestCheckpoint, recentTxsBySender } from "./tatum";
import { recallForKey, recallRules, recallSimilar, SIMILAR_MAX_DISTANCE, store, type Correction, type Recalled, type Rule } from "./memory";

export type Answer = {
  meaning: string | null;
  reply: string;
  queue: string;
  escalate: "normal" | "on-call";
  learnedFrom: { by: string; on: string; blobId: string; namespace: string } | null;
  escalatedBy: { text: string; by: string; on: string; failures: number } | null;
};

export type Triage = {
  message: string;
  diagnoses: Diagnosis[];
  primary: Diagnosis | null;
  withoutMemory: Answer;
  withMemory: Answer;
  similar: { key: string; meaning: string; queue: string; by: string; on: string; distance: number }[];
  memoryMode: "walrus" | "local-dev";
  timings: { tatumMs: number; memoryMs: number };
  notes: string[];
};

const GREETING = "Hi, thanks for reporting this.";

function blankAnswer(d: Diagnosis | null): Answer {
  const what = d ? d.summary : "I could not find a transaction digest or wallet address in this message.";
  return {
    meaning: null,
    reply: `${GREETING} ${what} A teammate will look into it and get back to you.`,
    queue: "Triage",
    escalate: "normal",
    learnedFrom: null,
    escalatedBy: null,
  };
}

function fromCorrection(d: Diagnosis | null, c: Recalled<Correction>): Answer {
  const r = c.record;
  return {
    meaning: r.meaning,
    reply: `${GREETING} ${r.reply || r.meaning}`,
    queue: r.queue,
    escalate: r.escalate,
    learnedFrom: { by: r.by, on: r.on, blobId: c.blobId, namespace: c.namespace },
    escalatedBy: null,
  };
}

export async function triage(message: string, namespaces: string[]): Promise<Triage> {
  const notes: string[] = [];
  const t0 = Date.now();
  const { digests, addresses } = extractRefs(message);

  const diagnoses: Diagnosis[] = [];
  for (const dg of digests.slice(0, 2)) diagnoses.push(diagnose(await getTransaction(dg), dg));

  let senderFailures: number | null = null;
  if (!digests.length && addresses.length) {
    const cp = await latestCheckpoint();
    const txs = await recentTxsBySender(addresses[0], cp - 216_000); // about one day of checkpoints
    const failed = txs.filter((t) => t.status !== "SUCCESS");
    senderFailures = failed.length;
    if (failed[0]) diagnoses.push(diagnose(failed[0], failed[0].digest));
    else notes.push("No failed transactions from this address in the last day.");
  }
  const tatumMs = Date.now() - t0;

  const primary = diagnoses.find((d) => d.kind === "move_abort" || d.kind === "out_of_gas" || d.kind === "other_failure") ?? diagnoses[0] ?? null;

  const t1 = Date.now();
  const withoutMemory = blankAnswer(primary);
  let withMemory = blankAnswer(primary);

  // Start the rule lookup alongside the correction lookup; both are Walrus recalls.
  const sender = primary?.sender ?? addresses[0] ?? null;
  const wantsRule = !!(sender && primary && primary.kind !== "success" && primary.kind !== "not_found");
  const rulesP: Promise<Recalled<Rule>[]> = wantsRule ? recallRules(namespaces) : Promise.resolve([]);
  rulesP.catch(() => {}); // avoid an unhandled rejection if the correction lookup throws first
  if (primary?.key) {
    const hit = await recallForKey(primary.key, namespaces);
    if (hit) withMemory = fromCorrection(primary, hit);
  }

  // Plain-language matching: only when the ticket has no usable chain reference,
  // or as "similar past cases" next to a ticket the agent has not been taught yet.
  let similar: Triage["similar"] = [];
  if (!primary || !withMemory.learnedFrom) {
    const text = message.replace(/\b[1-9A-HJ-NP-Za-km-z]{43,44}\b|\b0x[0-9a-fA-F]{64}\b/g, "").trim();
    if (text.length >= 12) {
      const hits = (await recallSimilar(text, namespaces)).filter((h) => h.distance <= SIMILAR_MAX_DISTANCE);
      similar = hits.map((h) => ({
        key: h.record.key,
        meaning: h.record.meaning,
        queue: h.record.queue,
        by: h.record.by,
        on: h.record.on,
        distance: Number(h.distance.toFixed(3)),
      }));
      if (!primary && hits[0]) withMemory = fromCorrection(null, hits[0]);
    }
  }

  // Escalation rules taught by the team, evaluated on chain data, never by the model.
  if (wantsRule && sender) {
    const rules = await rulesP;
    const rule = rules[0];
    if (rule) {
      if (senderFailures === null) {
        const cp = await latestCheckpoint();
        const txs = await recentTxsBySender(sender, cp - 216_000);
        senderFailures = txs.filter((t) => t.status !== "SUCCESS").length;
      }
      if (senderFailures >= rule.record.count) {
        withMemory = {
          ...withMemory,
          escalate: "on-call",
          escalatedBy: { text: rule.record.text, by: rule.record.by, on: rule.record.on, failures: senderFailures },
        };
      }
    }
  }

  return {
    message,
    diagnoses,
    primary,
    withoutMemory,
    withMemory,
    similar,
    memoryMode: store().mode,
    timings: { tatumMs, memoryMs: Date.now() - t1 },
    notes,
  };
}
