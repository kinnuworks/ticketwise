import { cookies } from "next/headers";
import { learn, TEAM_NS, type Correction } from "@/lib/memory";
import { isTeammate, json, limit, readNamespaces } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const key = s(b.key, 120);
  const meaning = s(b.meaning, 400);
  if (!/^[\w.-]+::[\w.:-]+#[\w-]+$/.test(key) || meaning.length < 5) {
    return json({ error: "A correction needs the failure and what it means." }, 400);
  }
  const team = isTeammate(b.passcode);
  const { sandbox, visitorId, ip } = await readNamespaces();
  if (!team) {
    const a = limit(`correct:${visitorId}`, 5);
    const c = limit(`correct-ip:${ip}`, 8);
    const g = limit("correct:all-visitors", 40);
    if (!a.ok || !c.ok || !g.ok) {
      return json({ error: "Demo visitors can teach 5 corrections an hour, so the shared memory quota lasts for everyone." }, 429);
    }
  }
  const record: Correction = {
    type: "correction",
    key,
    where: s(b.where, 200),
    meaning,
    reply: s(b.reply, 600),
    queue: s(b.queue, 40) || "Triage",
    escalate: b.escalate === "on-call" ? "on-call" : "normal",
    by: s(b.by, 40) || (team ? "a teammate" : "you (demo visitor)"),
    on: new Date().toISOString().slice(0, 10),
  };
  const ns = team ? TEAM_NS : sandbox;
  try {
    const t = Date.now();
    const { blobId, text } = await learn(record, ns);
    if (!team) (await cookies()).set("tw_taught", "1", { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
    return json({ ok: true, namespace: ns, team, blobId, text, ms: Date.now() - t });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Could not save to Walrus Memory" }, 502);
  }
}
