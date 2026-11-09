import { cookies } from "next/headers";
import { learn, TEAM_NS } from "@/lib/memory";
import { isTeammate, json, limit, readNamespaces } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const count = Math.min(10, Math.max(2, Number(b.count) || 2));
  const team = isTeammate(b.passcode);
  const { sandbox, visitorId } = await readNamespaces();
  if (!team && !limit(`rule:${visitorId}`, 2).ok) return json({ error: "Demo visitors can add 2 rules an hour." }, 429);
  const by = typeof b.by === "string" && b.by.trim() ? b.by.trim().slice(0, 40) : team ? "a teammate" : "you (demo visitor)";
  const text = `If the same wallet fails ${count} or more times in a day, page on-call.`;
  const ns = team ? TEAM_NS : sandbox;
  try {
    const r = await learn({ type: "rule", rule: "repeat_failure", count, escalate: "on-call", text, by, on: new Date().toISOString().slice(0, 10) }, ns);
    if (!team) (await cookies()).set("tw_taught", "1", { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
    return json({ ok: true, namespace: ns, ...r });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Could not save to Walrus Memory" }, 502);
  }
}
