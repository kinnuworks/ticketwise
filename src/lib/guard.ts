import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { sandboxNs, TEAM_NS } from "./memory";

// Small in-process limits. They protect the shared Walrus Memory relayer quota
// (500 points an hour per account) from one noisy visitor.
const buckets = new Map<string, { n: number; reset: number }>();
export function limit(key: string, max: number, windowMs = 3_600_000): { ok: boolean; left: number; resetIn: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return { ok: true, left: max - 1, resetIn: windowMs };
  }
  if (b.n >= max) return { ok: false, left: 0, resetIn: b.reset - now };
  b.n++;
  return { ok: true, left: max - b.n, resetIn: b.reset - now };
}

export async function visitor(): Promise<{ id: string; ip: string; isNew: boolean }> {
  const jar = await cookies();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  let id = jar.get("tw_visitor")?.value;
  let isNew = false;
  if (!id || !/^[a-f0-9]{16}$/.test(id)) {
    id = randomBytes(8).toString("hex");
    isNew = true;
    jar.set("tw_visitor", id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
  }
  return { id, ip, isNew };
}

export function isTeammate(passcode: unknown): boolean {
  const p = process.env.TEAM_PASSCODE;
  return Boolean(p && typeof passcode === "string" && passcode === p);
}

export async function readNamespaces(): Promise<{ namespaces: string[]; sandbox: string; visitorId: string; ip: string }> {
  const v = await visitor();
  const jar = await cookies();
  const sandbox = sandboxNs(v.id);
  const hasSandbox = jar.get("tw_taught")?.value === "1";
  return { namespaces: hasSandbox ? [TEAM_NS, sandbox] : [TEAM_NS], sandbox, visitorId: v.id, ip: v.ip };
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
