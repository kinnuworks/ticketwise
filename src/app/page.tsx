"use client";

import { useEffect, useState } from "react";
import type { Triage, Answer } from "@/lib/triage";
import type { Diagnosis } from "@/lib/diagnose";

type QueueItem = { id: string; at: string; message: string; key: string | null; queue: string; learned: boolean };

const QUEUES = ["Triage", "Trading", "Wallet & gas", "Bugs", "Billing"];

function day(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function suiscan(digest: string) {
  return `https://suiscan.xyz/mainnet/tx/${digest}`;
}

export default function Inbox() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Triage | null>(null);
  const [memoryOn, setMemoryOn] = useState(true);
  const [recent, setRecent] = useState<Diagnosis[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    try {
      setQueue(JSON.parse(localStorage.getItem("tw_queue") || "[]"));
    } catch {}
    fetch("/api/recent-failures")
      .then((r) => r.json())
      .then((d) => setRecent(d.items ?? []))
      .catch(() => {});
  }, []);

  async function submit(text: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    setMemoryOn(true);
    const t = Date.now();
    try {
      const r = await fetch("/api/triage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Triage failed");
      setResult(d);
      setElapsed(Date.now() - t);
      const item: QueueItem = {
        id: `${Date.now()}`,
        at: new Date().toISOString(),
        message: text.slice(0, 140),
        key: d.primary?.key ?? null,
        queue: d.withMemory.queue,
        learned: Boolean(d.withMemory.learnedFrom),
      };
      setQueue((prev) => {
        const next = [item, ...prev].slice(0, 30);
        try {
          localStorage.setItem("tw_queue", JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage failed");
    } finally {
      setBusy(false);
    }
  }

  function tryReal() {
    if (!recent.length) return;
    const d = recent[Math.floor(Math.random() * recent.length)];
    const text = `Hi, my transaction failed and I don't know why. ${d.digest}`;
    setMessage(text);
    submit(text);
  }

  return (
    <>
      <h1>Support inbox</h1>
      <p className="lede">
        Paste a user&apos;s support message with a failed Sui transaction or wallet address. Ticketwise reads the chain through Tatum,
        explains the failure, and answers with what your team taught it. Every correction is stored in Walrus Memory.
      </p>
      <div className="grid">
        <div>
          <div className="card">
            <label htmlFor="msg">Support message</label>
            <textarea
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. My order cancel keeps failing: 6xYz… (transaction digest) or 0x… (wallet address)"
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button disabled={busy || message.trim().length < 3} onClick={() => submit(message)}>
                {busy ? "Reading the chain…" : "Triage ticket"}
              </button>
              <button className="ghost" disabled={busy || !recent.length} onClick={tryReal}>
                Use a real failed transaction
              </button>
              <span className="muted small">{recent.length ? `${recent.length} recent mainnet failures loaded` : "loading recent failures…"}</span>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
          {result && (
            <TicketResult
              t={result}
              memoryOn={memoryOn}
              setMemoryOn={setMemoryOn}
              elapsed={elapsed}
              onSaved={() => submit(result.message)}
            />
          )}
        </div>
        <aside>
          <div className="card soft">
            <h3 style={{ marginTop: 0 }}>Queue</h3>
            {!queue.length && <p className="muted small">Tickets you triage show up here.</p>}
            <ul className="queue" style={{ paddingLeft: 16, margin: 0 }}>
              {queue.slice(0, 12).map((q) => (
                <li key={q.id} className="small">
                  <span className="tag">{q.queue}</span> {q.learned && <span className="tag learned">taught</span>}
                  <div className="muted" style={{ overflowWrap: "anywhere" }}>{q.message}</div>
                </li>
              ))}
            </ul>
          </div>
          <RuleCard />
          <div className="card soft small">
            <h3 style={{ marginTop: 0 }}>How it learns</h3>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>Triage a failed transaction. If nobody taught it this error yet, it says so.</li>
              <li>Correct it: what the error means, the reply, the queue.</li>
              <li>Triage the same kind of failure again. The answer now comes from your correction, with your name and the date.</li>
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}

function TicketResult({
  t,
  memoryOn,
  setMemoryOn,
  elapsed,
  onSaved,
}: {
  t: Triage;
  memoryOn: boolean;
  setMemoryOn: (v: boolean) => void;
  elapsed: number | null;
  onSaved: () => void;
}) {
  const d = t.primary;
  const a: Answer = memoryOn ? t.withMemory : t.withoutMemory;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Ticket</h2>
        <div className="toggle" role="group" aria-label="Memory">
          <button className={memoryOn ? "on" : ""} onClick={() => setMemoryOn(true)}>Memory on</button>
          <button className={!memoryOn ? "on" : ""} onClick={() => setMemoryOn(false)}>Memory off</button>
        </div>
      </div>
      {t.memoryMode === "local-dev" && <p className="unknown-note">Developer mode: memory is held in this server process, not Walrus.</p>}

      <h3>What happened on chain</h3>
      {d ? (
        <>
          <p style={{ margin: "4px 0" }}>{d.summary}</p>
          <p className="small muted" style={{ margin: 0 }}>
            <a href={suiscan(d.digest)} target="_blank" rel="noreferrer" className="mono">{d.digest}</a>
            {d.key && <> · failure <span className="mono">{d.key}</span></>}
            {d.sourceEntry?.source && (
              <> · <a href={d.sourceEntry.source} target="_blank" rel="noreferrer">source</a></>
            )}
          </p>
        </>
      ) : (
        <p className="muted">No transaction in this message. {t.notes.join(" ")}</p>
      )}

      <h3>Answer</h3>
      <div className="row">
        <span className="tag">Queue: {a.queue}</span>
        <span className={`tag ${a.escalate === "on-call" ? "oncall" : ""}`}>{a.escalate === "on-call" ? "Page on-call" : "Normal priority"}</span>
        {a.learnedFrom && <span className="tag learned">{a.learnedFrom.namespace.includes("-sb-") ? "taught by you (sandbox)" : "taught by your team"}</span>}
      </div>
      {a.learnedFrom ? (
        <div className="learned-note">
          Learned from {a.learnedFrom.by}&apos;s correction on {day(a.learnedFrom.on)}.{" "}
          {a.learnedFrom.blobId && !a.learnedFrom.blobId.startsWith("local-") && (
            <a href={`https://walruscan.com/mainnet/blob/${a.learnedFrom.blobId}`} target="_blank" rel="noreferrer">Stored on Walrus</a>
          )}
        </div>
      ) : (
        d?.key && (
          <div className="unknown-note">
            {memoryOn ? "Nobody has taught me what this error means for your users yet." : "Memory is off: this is the answer without anything your team taught."}
          </div>
        )
      )}
      {a.escalatedBy && (
        <div className="learned-note">
          Paged on-call: this wallet failed {a.escalatedBy.failures} times today. Rule from {a.escalatedBy.by} on {day(a.escalatedBy.on)}: “{a.escalatedBy.text}”
        </div>
      )}
      {a.meaning && <p><strong>What it means:</strong> {a.meaning}</p>}
      <label>Draft reply</label>
      <div className="card soft" style={{ marginBottom: 8 }}>{a.reply}</div>
      <p className="small muted">
        {elapsed !== null && <>Answered in {(elapsed / 1000).toFixed(1)} s · </>}chain read {t.timings.tatumMs} ms · memory {t.timings.memoryMs} ms
      </p>

      {memoryOn && t.similar.length > 0 && !a.learnedFrom && (
        <>
          <h3>Similar past cases</h3>
          <ul className="small">
            {t.similar.map((s) => (
              <li key={s.key}>
                <span className="mono">{s.key}</span>: {s.meaning} <span className="muted">({s.queue}, taught by {s.by} on {s.on}, distance {s.distance})</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {d?.key && memoryOn && <CorrectForm d={d} current={t.withMemory} onSaved={onSaved} />}
    </div>
  );
}

function CorrectForm({ d, current, onSaved }: { d: Diagnosis; current: Answer; onSaved: () => void }) {
  const [open, setOpen] = useState(!current.learnedFrom);
  const [meaning, setMeaning] = useState(current.meaning ?? "");
  const [reply, setReply] = useState(current.learnedFrom ? current.reply.replace(/^Hi, thanks for reporting this\.\s*/, "") : "");
  const [queue, setQueue] = useState(current.queue === "Triage" ? "Trading" : current.queue);
  const [escalate, setEscalate] = useState<"normal" | "on-call">(current.escalate);
  const [by, setBy] = useState("");
  const [passcode, setPasscode] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function save() {
    setState("saving");
    setMsg("");
    try {
      const r = await fetch("/api/correct", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: d.key,
          where: `${d.packageName ?? d.packageAddress ?? ""} ${d.module ?? ""}${d.fn ? `::${d.fn}` : ""} abort ${d.code ?? ""}`.trim(),
          meaning,
          reply,
          queue,
          escalate,
          by,
          passcode: passcode || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setState("saved");
      setMsg(
        `${j.mode === "walrus" ? "Saved to Walrus Memory on Sui mainnet" : "Saved in developer mode (not Walrus)"}${j.team ? " for the whole team" : " in your demo sandbox"} in ${(j.ms / 1000).toFixed(1)} s${
          j.blobId && !String(j.blobId).startsWith("local-") ? ` (blob ${String(j.blobId).slice(0, 10)}…)` : ""
        }.`,
      );
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
  }

  if (!open)
    return (
      <button className="ghost" onClick={() => setOpen(true)}>
        Correct this answer
      </button>
    );
  return (
    <div className="card soft">
      <h3 style={{ marginTop: 0 }}>Teach Ticketwise</h3>
      {d.sourceEntry?.constant && (
        <p className="small muted" style={{ marginTop: 0 }}>
          The contract source calls this error <span className="mono">{d.sourceEntry.constant}</span>
          {d.sourceEntry.meaning ? `: ${d.sourceEntry.meaning}` : ""}
        </p>
      )}
      <label>What this error means for the user</label>
      <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="e.g. The order was already filled or cancelled before your cancel arrived." />
      <label>What to tell them</label>
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="e.g. Refresh your open orders. Nothing was lost except a small gas fee." />
      <div className="row">
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Queue</label>
          <select value={queue} onChange={(e) => setQueue(e.target.value)}>
            {QUEUES.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Priority</label>
          <select value={escalate} onChange={(e) => setEscalate(e.target.value as "normal" | "on-call")}>
            <option value="normal">Normal</option>
            <option value="on-call">Page on-call</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label>Your name</label>
          <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="optional" />
        </div>
      </div>
      <label>Team passcode (leave empty to try it in your own sandbox)</label>
      <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
      <div className="row" style={{ marginTop: 10 }}>
        <button disabled={state === "saving" || meaning.trim().length < 5} onClick={save}>
          {state === "saving" ? "Saving to Walrus…" : "Save correction"}
        </button>
        {state === "saved" && (
          <button className="ghost" onClick={onSaved}>
            Triage this ticket again
          </button>
        )}
      </div>
      {state === "saving" && (
        <p className="small">
          Writing to Walrus on Sui mainnet. This usually takes about 20 seconds, because the memory is encrypted, stored
          and registered on chain before it can be recalled.
        </p>
      )}
      {msg && <p className={state === "error" ? "error" : "small"}>{msg}</p>}
    </div>
  );
}

function RuleCard() {
  const [count, setCount] = useState(2);
  const [passcode, setPasscode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/rule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count, passcode: passcode || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setMsg(j.namespace?.includes("-sb-") ? "Rule saved in your demo sandbox." : "Rule saved for the whole team.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card soft small">
      <h3 style={{ marginTop: 0 }}>Escalation rule</h3>
      <p style={{ margin: 0 }}>
        If the same wallet fails{" "}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: "auto", padding: "2px 4px" }}>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>{" "}
        or more times in a day, page on-call.
      </p>
      <input type="password" placeholder="Team passcode (optional)" value={passcode} onChange={(e) => setPasscode(e.target.value)} style={{ marginTop: 8 }} />
      <button className="ghost" style={{ marginTop: 8 }} disabled={busy} onClick={save}>{busy ? "Saving to Walrus (about 20 s)…" : "Teach this rule"}</button>
      {msg && <p style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
