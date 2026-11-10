// Ticketwise as an MCP server (streamable HTTP, JSON responses). Any MCP client, such as a
// coding assistant or another agent, can read what the support team taught, from the same
// Walrus Memory namespace the inbox uses. Read-only on purpose: writes stay in the inbox,
// behind the team passcode, because they spend the shared Walrus quota.
import { triage } from "@/lib/triage";
import { recallForKey, recallRules, store, TEAM_NS } from "@/lib/memory";
import { limit } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROTOCOL = "2025-06-18";
const TOOLS = [
  {
    name: "triage_ticket",
    description:
      "Triage a support message for a Sui app. Reads the failed transaction (digest or wallet address in the message) from Sui mainnet through Tatum, names the contract error, and answers from the team's corrections in Walrus Memory.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string", description: "The user's support message, including a transaction digest or 0x wallet address." } },
      required: ["message"],
    },
  },
  {
    name: "lookup_error",
    description:
      "Look up what the support team taught about one contract error, by failure key (package::module#code, for example deepbook::big_vector#5). Returns the meaning, the reply, the queue, who taught it and the Walrus blob.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "Failure key, for example deepbook::big_vector#5" } },
      required: ["key"],
    },
  },
  {
    name: "list_team_memory",
    description: "List how many corrections and rules the team has stored in Walrus Memory, with the escalation rule in force.",
    inputSchema: { type: "object", properties: {} },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], isError });
const walruscan = (blob: string) => (blob && !blob.startsWith("local-") ? `https://walruscan.com/mainnet/blob/${blob}` : "(developer store)");

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "triage_ticket") {
    const message = String(args.message ?? "").slice(0, 2000).trim();
    if (message.length < 3) return text("Send the user's message with a transaction digest or wallet address.", true);
    const t = await triage(message, [TEAM_NS]);
    const d = t.primary;
    const a = t.withMemory;
    const lines = [
      d ? `On chain: ${d.summary}` : `No transaction found in the message. ${t.notes.join(" ")}`,
      d?.key ? `Failure key: ${d.key}${d.sourceEntry?.constant ? ` (${d.sourceEntry.constant})` : ""}` : "",
      d ? `Transaction: https://suiscan.xyz/mainnet/tx/${d.digest}` : "",
      a.learnedFrom
        ? `Answer from team memory: learned from ${a.learnedFrom.by}'s correction on ${a.learnedFrom.on} (${walruscan(a.learnedFrom.blobId)})`
        : "Nobody on the team has taught this error yet.",
      a.meaning ? `Meaning: ${a.meaning}` : "",
      `Queue: ${a.queue}. Priority: ${a.escalate === "on-call" ? "page on-call" : "normal"}.`,
      a.escalatedBy ? `Escalated: this wallet failed ${a.escalatedBy.failures} times today (rule from ${a.escalatedBy.by}).` : "",
      `Draft reply: ${a.reply}`,
    ];
    return text(lines.filter(Boolean).join("\n"));
  }
  if (name === "lookup_error") {
    const key = String(args.key ?? "").trim();
    if (!/^[\w.-]+::[\w.:-]+#[\w-]+$/.test(key)) return text("Use a failure key like deepbook::big_vector#5.", true);
    const hit = await recallForKey(key, [TEAM_NS]);
    if (!hit) return text(`Nobody on the team has taught ${key} yet.`);
    const r = hit.record;
    return text(
      [
        `${key}: ${r.meaning}`,
        `Reply: ${r.reply}`,
        `Queue: ${r.queue}. Priority: ${r.escalate === "on-call" ? "page on-call" : "normal"}.`,
        `Taught by ${r.by} on ${r.on}. Stored on Walrus: ${walruscan(hit.blobId)}`,
      ].join("\n"),
    );
  }
  if (name === "list_team_memory") {
    const rows = await store().list(TEAM_NS);
    const rules = await recallRules([TEAM_NS]);
    const rule = rules[0]?.record;
    return text(
      [
        `${rows.length} memories in namespace ${TEAM_NS} (${store().mode === "walrus" ? "Walrus Memory on Sui mainnet" : "developer store"}).`,
        rule ? `Escalation rule: ${rule.text} (from ${rule.by} on ${rule.on}).` : "No escalation rule taught yet.",
        "Full list with Walruscan links: https://ticketwise-gamma.vercel.app/proof",
      ].join("\n"),
    );
  }
  return text(`Unknown tool: ${name}`, true);
}

async function handle(m: Rpc) {
  switch (m.method) {
    case "initialize":
      return ok(m.id, {
        protocolVersion: (m.params?.protocolVersion as string) || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "ticketwise", version: "1.0.0" },
        instructions: "Read-only access to a Sui support team's memory: triage tickets and look up what each contract error means.",
      });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      try {
        return ok(m.id, await callTool(name, (m.params?.arguments as Record<string, unknown>) ?? {}));
      } catch (e) {
        return ok(m.id, text(e instanceof Error ? e.message : "Tool failed", true));
      }
    }
    default:
      return err(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const l = limit(`mcp:${ip}`, 60);
  if (!l.ok) return Response.json(err(null, -32000, "Rate limit: 60 calls an hour per client."), { status: 429 });
  const body = (await req.json().catch(() => null)) as Rpc | Rpc[] | null;
  if (!body) return Response.json(err(null, -32700, "Parse error"), { status: 400 });
  const batch = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of batch) {
    if (m.id === undefined || m.id === null) continue; // notifications get no response
    out.push(await handle(m));
  }
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0], { headers: { "MCP-Protocol-Version": PROTOCOL } });
}

export async function GET() {
  return new Response("Ticketwise MCP endpoint. POST JSON-RPC here (MCP streamable HTTP).", { status: 405, headers: { Allow: "POST" } });
}
