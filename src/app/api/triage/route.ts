import { triage } from "@/lib/triage";
import { json, limit, readNamespaces } from "@/lib/guard";
import { TatumError } from "@/lib/tatum";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = (body.message ?? "").toString().slice(0, 2000).trim();
  if (message.length < 3) return json({ error: "Write a message, or paste a transaction digest or wallet address." }, 400);
  const { namespaces, ip } = await readNamespaces();
  const l = limit(`triage:${ip}`, 30);
  if (!l.ok) return json({ error: `This demo allows 30 tickets an hour per visitor. Try again in ${Math.ceil(l.resetIn / 60000)} minutes.` }, 429);
  try {
    return json(await triage(message, namespaces));
  } catch (e) {
    const status = e instanceof TatumError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, status >= 400 && status < 600 ? status : 500);
  }
}
