"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Triage, Answer } from "@/lib/triage";
import type { Diagnosis } from "@/lib/diagnose";
import sc from "@/data/scorecard.json";
import { Alert, Arrow, Bell, Chain, CheckCircle, Inbox as InboxIcon, Layers, Pen, Repeat, Shuffle } from "./icons";

type QueueItem = { id: string; at: string; message: string; key: string | null; queue: string; learned: boolean };
type Score = {
  pending?: boolean;
  days: number;
  packages: string[];
  split: { train: number; test: number };
  withoutMemory: { answered: number; of: number };
  withMemory: { answered: number; of: number };
};

const QUEUES = ["Triage", "Trading", "Wallet & gas", "Bugs", "Billing"];
const score = sc as unknown as Score;

function day(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
const suiscan = (digest: string) => `https://suiscan.xyz/mainnet/tx/${digest}`;
const short = (s: string) => (s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");

export default function Home() {
  return (
    <>
      <section className="hero hero--color hero--app">
        <div className="container">
          <span className="badge badge--dot">Live on Sui mainnet</span>
          <h1>
            Support that learns <span className="t-muted">your errors.</span>
          </h1>
          <p className="lead">
            Paste a user&apos;s message with a failed Sui transaction. Ticketwise reads it from the chain through Tatum, explains
            it in plain words, and answers with what your team taught it.
          </p>
          <div className="trust">
            <span>No sign-up</span>
            <span>Reads mainnet through Tatum</span>
            <span>Remembers in Walrus Memory</span>
          </div>
          <div className="hero__visual bleed" id="inbox">
            <div className="window">
              <div className="window__bar">
                <div className="lights" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <span className="window__title">Support inbox</span>
              </div>
              <InboxApp />
            </div>
          </div>
        </div>
      </section>

      <section className="section section--alt after-bleed" id="how">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">
              <span className="dot" /> How it learns
            </span>
            <h2>
              Correct it once. <span className="t-muted">It remembers.</span>
            </h2>
            <p className="lead">
              Most tickets for a Sui app are the same few contract errors, over and over. Teach Ticketwise what one means, and every
              later ticket with that error gets the right answer, with your name on it.
            </p>
          </div>
          <div className="grid grid-3">
            <div className="tile reveal" style={{ ["--i" as string]: 0 }}>
              <span className="icon-tile"><Chain /></span>
              <div>
                <div className="step-num">01</div>
                <p className="t-title">It reads the failure</p>
                <p>
                  Paste a digest or wallet address. Tatum&apos;s Sui gateway returns the abort code, module and function, and
                  Ticketwise names the error from the contract&apos;s source.
                </p>
              </div>
            </div>
            <div className="tile reveal" style={{ ["--i" as string]: 1 }}>
              <span className="icon-tile"><Pen /></span>
              <div>
                <div className="step-num">02</div>
                <p className="t-title">You correct it once</p>
                <p>
                  Say what the error means for users, what to reply and which queue owns it. The correction goes to Walrus Memory
                  with your name and the date.
                </p>
              </div>
            </div>
            <div className="tile reveal" style={{ ["--i" as string]: 2 }}>
              <span className="icon-tile"><Repeat /></span>
              <div>
                <div className="step-num">03</div>
                <p className="t-title">It answers the next one</p>
                <p>
                  The next ticket with that error is answered from your correction. Switch memory off to see the answer without
                  it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!score.pending && (
        <section className="section">
          <div className="container split">
            <div>
              <span className="eyebrow">
                <span className="dot" /> Replay on real failures
              </span>
              <h3>
                {score.withMemory.answered} of {score.withMemory.of} later tickets answered from memory.
              </h3>
              <p className="t-small">
                We pulled {score.split.train + score.split.test} real failed transactions from {score.packages.join(", ")} over{" "}
                {score.days} days. Corrections were taught from the first {score.split.train}. The last {score.split.test} were
                then triaged with memory off and on.
              </p>
              <p className="t-small">
                Every error in the later set had already shown up earlier. That&apos;s what support queues look like: the same
                errors keep coming back.
              </p>
              <div className="cta-row" style={{ justifyContent: "flex-start" }}>
                <Link href="/scorecard" className="btn btn-outline">
                  See the scorecard <Arrow />
                </Link>
              </div>
            </div>
            <div className="stage stage--soft reveal">
              <div className="compare">
                <div className="card">
                  <div className="t-micro">Memory off</div>
                  <div className="bignum bignum--muted">{pct(score.withoutMemory.answered, score.withoutMemory.of)}</div>
                  <div className="t-small">
                    {score.withoutMemory.answered} of {score.withoutMemory.of} answered with what the team taught
                  </div>
                </div>
                <div className="card card--chosen">
                  <div className="t-micro">Memory on</div>
                  <div className="bignum">{pct(score.withMemory.answered, score.withMemory.of)}</div>
                  <div className="t-small">
                    {score.withMemory.answered} of {score.withMemory.of} answered from a teammate&apos;s correction
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section section--alt why">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">
              <span className="dot" /> Under the hood
            </span>
            <h2>Why it needs Tatum and Walrus.</h2>
          </div>
          <div className="grid grid-2">
            <div className="card reveal" style={{ ["--i" as string]: 0 }}>
              <span className="icon-tile"><Chain /></span>
              <h3>Tatum reads the chain.</h3>
              <p className="t-small">
                Every answer starts from mainnet data: the transaction&apos;s status, abort code, module and function, read through
                Tatum&apos;s Sui gateway. Nothing is guessed from the user&apos;s description.
              </p>
            </div>
            <div className="card reveal" style={{ ["--i" as string]: 1 }}>
              <span className="icon-tile"><Layers /></span>
              <h3>Walrus keeps what it learned.</h3>
              <p className="t-small">
                Corrections and escalation rules live in Walrus Memory on Sui mainnet, not on this server. Wipe the search index
                and it rebuilds from Walrus. The Proof page lists the stored memories and the last check.
              </p>
              <div>
                <Link href="/proof" className="btn btn-sm btn-outline">
                  See the proof <Arrow />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function InboxApp() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Triage | null>(null);
  const [memoryOn, setMemoryOn] = useState(true);
  const [recent, setRecent] = useState<Diagnosis[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    try {
      setQueue(JSON.parse(localStorage.getItem("tw_queue") || "[]"));
    } catch {}
    fetch("/api/recent-failures")
      .then((r) => r.json())
      .then((d) => setRecent(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingRecent(false));
  }, []);

  // First visit: answer a real failed transaction right away, so the first screen shows the product working.
  useEffect(() => {
    if (autoRan.current || !recent.length) return;
    autoRan.current = true;
    let seen = false;
    try {
      seen = localStorage.getItem("tw_seen") === "1";
      localStorage.setItem("tw_seen", "1");
    } catch {}
    if (!seen) tryReal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent]);

  async function submit(text: string) {
    setBusy(true);
    setError(null);
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
    <div className="app">
      <div className="app__main">
        <div className="composer">
          <label className="field-label" htmlFor="msg">
            Support message
          </label>
          <textarea
            id="msg"
            className="textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste what the user wrote, with a transaction digest or a 0x… wallet address."
          />
          <div className="composer__actions">
            <button className="btn btn-primary" disabled={busy || message.trim().length < 3} onClick={() => submit(message)}>
              {busy ? "Reading the chain…" : "Triage ticket"}
            </button>
            <button className="btn btn-outline" disabled={busy || !recent.length} onClick={tryReal}>
              <Shuffle /> Use a real failed transaction
            </button>
            <span className="t-micro composer__hint">
              {loadingRecent
                ? "Loading recent mainnet failures…"
                : recent.length
                  ? `${recent.length} recent mainnet ${recent.length === 1 ? "failure" : "failures"} ready`
                  : "No recent failures loaded. Paste a digest instead."}
            </span>
          </div>
          {error && <p className="error">{error}</p>}
        </div>

        {result ? (
          <TicketResult t={result} memoryOn={memoryOn} setMemoryOn={setMemoryOn} elapsed={elapsed} onSaved={() => submit(result.message)} />
        ) : (
          <div className="idle">
            <p className="t-title">{busy ? "Reading a real failed transaction from Sui mainnet…" : "Try it in 30 seconds"}</p>
            <ol>
              <li>Click &quot;Use a real failed transaction&quot;. It pulls a fresh failure from mainnet.</li>
              <li>If nobody has taught Ticketwise that error yet, it says so. Correct it and save.</li>
              <li>Triage it again. The answer now comes from your correction.</li>
            </ol>
          </div>
        )}
      </div>

      <aside className="app__side">
        <div className="side-card">
          <p className="t-title">
            <InboxIcon size={16} /> Queue <span className="count">{queue.length}</span>
          </p>
          {!queue.length ? (
            <p className="t-micro">Tickets you triage show up here.</p>
          ) : (
            <ul className="queue">
              {queue.slice(0, 12).map((q) => (
                <li key={q.id}>
                  <div className="row">
                    <span className="pill mini">{q.queue}</span>
                    {q.learned && <span className="pill pill--learned mini">taught</span>}
                  </div>
                  <span className="msg">{q.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <RuleCard />
      </aside>
    </div>
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
  const sandbox = a.learnedFrom?.namespace.includes("-sb-");
  return (
    <div className="ticket" key={`${d?.digest}-${t.withMemory.learnedFrom?.blobId ?? "none"}`}>
      <div className="ticket__head">
        <p className="t-title">Ticket</p>
        <div className="segmented" role="group" aria-label="Memory">
          <button aria-pressed={memoryOn} onClick={() => setMemoryOn(true)}>
            Memory on
          </button>
          <button aria-pressed={!memoryOn} onClick={() => setMemoryOn(false)}>
            Memory off
          </button>
        </div>
      </div>
      {t.memoryMode === "local-dev" && <div className="note note--dev">Developer mode: memory is held on this server, not in Walrus.</div>}

      <div className="ticket__section">
        <div className="ticket__label">
          <Chain size={14} /> What happened on chain <span className="src">via Tatum</span>
        </div>
        {d ? (
          <>
            <p>{d.summary}</p>
            <div className="meta">
              <a className="mono-chip" href={suiscan(d.digest)} target="_blank" rel="noreferrer" title={d.digest}>
                tx {short(d.digest)}
              </a>
              {d.key && <span className="mono-chip">{d.key}</span>}
              {d.sourceEntry?.constant && <span className="mono-chip">{d.sourceEntry.constant}</span>}
              {d.sourceEntry?.source && (
                <a className="mono-chip" href={d.sourceEntry.source} target="_blank" rel="noreferrer">
                  contract source
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="t-small">No transaction in this message. {t.notes.join(" ")}</p>
        )}
      </div>

      <div className="ticket__section">
        <div className="ticket__label">
          <Layers size={14} /> Answer <span className="src">{memoryOn ? "with Walrus Memory" : "memory off"}</span>
        </div>
        <div className="meta" style={{ marginTop: 0 }}>
          <span className="pill">Queue: {a.queue}</span>
          {a.escalate === "on-call" ? (
            <span className="pill pill--warn">
              <Bell /> Page on-call
            </span>
          ) : (
            <span className="pill">Normal priority</span>
          )}
          {a.learnedFrom && (
            <span className="pill pill--learned">
              <CheckCircle /> {sandbox ? "Taught by you (sandbox)" : "Taught by your team"}
            </span>
          )}
        </div>
        {a.learnedFrom ? (
          <div className="note note--learned">
            <CheckCircle />
            <span>
              Learned from {a.learnedFrom.by}&apos;s correction on {day(a.learnedFrom.on)}.{" "}
              {a.learnedFrom.blobId && !a.learnedFrom.blobId.startsWith("local-") && (
                <a href={`https://walruscan.com/mainnet/blob/${a.learnedFrom.blobId}`} target="_blank" rel="noreferrer">
                  Stored on Walrus
                </a>
              )}
            </span>
          </div>
        ) : (
          d?.key && (
            <div className="note note--warn">
              <Alert />
              <span>
                {memoryOn
                  ? "Nobody has taught me what this error means for your users yet."
                  : "Memory is off. This is the answer without anything your team taught."}
              </span>
            </div>
          )
        )}
        {a.escalatedBy && (
          <div className="note note--warn">
            <Bell />
            <span>
              Paged on-call: this wallet failed {a.escalatedBy.failures} times today. Rule from {a.escalatedBy.by} on{" "}
              {day(a.escalatedBy.on)}.
            </span>
          </div>
        )}
        {a.meaning && (
          <p style={{ marginTop: 12 }}>
            <strong>What it means:</strong> {a.meaning}
          </p>
        )}
      </div>

      <div className="ticket__section">
        <div className="ticket__label">Draft reply</div>
        <div className="reply">{a.reply}</div>
        <p className="timing">
          {elapsed !== null && <>answered in {(elapsed / 1000).toFixed(1)} s · </>}chain {t.timings.tatumMs} ms · memory {t.timings.memoryMs} ms
        </p>
      </div>

      {memoryOn && t.similar.length > 0 && !a.learnedFrom && (
        <div className="ticket__section">
          <div className="ticket__label">Similar past cases</div>
          <ul className="similar">
            {t.similar.map((s) => (
              <li key={s.key}>
                <span className="t-mono">{s.key}</span>: {s.meaning}{" "}
                <span className="t-micro">
                  ({s.queue}, taught by {s.by} on {s.on})
                </span>
              </li>
            ))}
          </ul>
        </div>
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
        `${j.mode === "walrus" ? "Saved to Walrus Memory on Sui mainnet" : "Saved in developer mode (not Walrus)"}${j.team ? " for the whole team" : " in your demo sandbox"} in ${(j.ms / 1000).toFixed(1)} s.`,
      );
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
  }

  if (!open)
    return (
      <div className="ticket__section">
        <button className="btn btn-sm btn-outline" onClick={() => setOpen(true)}>
          <Pen size={15} /> Correct this answer
        </button>
      </div>
    );
  return (
    <div className="teach">
      <p className="t-title">Teach Ticketwise</p>
      {d.sourceEntry?.constant && (
        <p className="t-small">
          The contract source calls this error <span className="t-mono">{d.sourceEntry.constant}</span>
          {d.sourceEntry.meaning ? `: ${d.sourceEntry.meaning}` : "."}
        </p>
      )}
      <label className="field-label" htmlFor="t-meaning" style={{ marginTop: 14 }}>
        What this error means for the user
      </label>
      <input id="t-meaning" className="input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="The order was already filled or canceled before the cancel arrived." />
      <label className="field-label" htmlFor="t-reply">
        What to tell them
      </label>
      <textarea id="t-reply" className="textarea" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Refresh your open orders. Only the gas fee was charged." />
      <div className="fields">
        <div>
          <label className="field-label" htmlFor="t-queue">Queue</label>
          <select id="t-queue" className="select" value={queue} onChange={(e) => setQueue(e.target.value)}>
            {QUEUES.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="t-prio">Priority</label>
          <select id="t-prio" className="select" value={escalate} onChange={(e) => setEscalate(e.target.value as "normal" | "on-call")}>
            <option value="normal">Normal</option>
            <option value="on-call">Page on-call</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="t-by">Your name</label>
          <input id="t-by" className="input" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <label className="field-label" htmlFor="t-pass">
        Team passcode <span className="t-micro">(leave empty to save to your own sandbox)</span>
      </label>
      <input id="t-pass" className="input" type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
      <div className="composer__actions" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" disabled={state === "saving" || meaning.trim().length < 5} onClick={save}>
          {state === "saving" ? "Saving to Walrus…" : "Save correction"}
        </button>
        {state === "saved" && (
          <button className="btn btn-outline" onClick={onSaved}>
            <Repeat size={16} /> Triage this ticket again
          </button>
        )}
      </div>
      {state === "saving" && (
        <div className="saving">
          <span className="spinner" aria-hidden="true" />
          Writing to Walrus on Sui mainnet. This takes about 20 seconds: the memory is encrypted, stored and registered on chain.
        </div>
      )}
      {msg && (state === "error" ? <p className="error">{msg}</p> : <div className="note note--learned"><CheckCircle /><span>{msg}</span></div>)}
    </div>
  );
}

function RuleCard() {
  const [count, setCount] = useState(3);
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
    <div className="side-card">
      <p className="t-title">
        <Bell size={16} /> Escalation rule
      </p>
      <p className="rule-text">
        If the same wallet fails{" "}
        <select className="select select--inline" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Failures per day">
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>{" "}
        or more times in a day, page on-call.
      </p>
      <input className="input" type="password" placeholder="Team passcode (optional)" value={passcode} onChange={(e) => setPasscode(e.target.value)} style={{ marginTop: 10 }} aria-label="Team passcode" />
      <button className="btn btn-sm btn-outline" style={{ marginTop: 10, width: "100%" }} disabled={busy} onClick={save}>
        {busy ? "Saving to Walrus (about 20 s)…" : "Teach this rule"}
      </button>
      {msg && <p className="t-micro" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
