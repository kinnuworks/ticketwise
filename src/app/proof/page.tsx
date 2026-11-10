"use client";
import { useEffect, useState } from "react";
import last from "@/data/durability.json";
import { Layers } from "../icons";

type Proof = {
  namespaces?: { namespace: string; what: string; count: number }[];
  total?: number;
  mode: string;
  namespace: string;
  account: string | null;
  count: number;
  memories: { blobId: string; createdAt: string | null; walrus: string | null }[];
  error?: string;
};
type Step = { step: string; ok: boolean; detail: string; ms: number };

const STEP_NAMES: Record<string, string> = {
  seed: "Save a correction",
  "recall before": "Recall it",
  "forget index": "Delete the search index",
  "recall after forget": "Recall again",
  "restore from Walrus": "Restore from Walrus",
  "recall after restore": "Recall after restore",
};

function Steps({ steps }: { steps: Step[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {steps.map((s, i) => (
            <tr key={i}>
              <td style={{ width: 28 }}>{s.ok ? <span className="check">✓</span> : <span className="cross">✗</span>}</td>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{STEP_NAMES[s.step] ?? s.step}</td>
              <td className="t-small" style={{ overflowWrap: "anywhere" }}>{s.detail}</td>
              <td className="num t-micro">{s.ms} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProofPage() {
  const [p, setP] = useState<Proof | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/proof")
      .then((r) => r.json())
      .then(setP)
      .catch(() => {});
  }, []);
  async function run() {
    setBusy(true);
    const r = await fetch("/api/restore-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: pass }) });
    const j = await r.json();
    setSteps(j.steps ?? [{ step: "error", ok: false, detail: j.error, ms: 0 }]);
    setBusy(false);
  }
  return (
    <>
      <section className="hero hero--color hero--app hero--sub">
        <div className="container">
          <span className="badge badge--dot">Walrus Memory on Sui mainnet</span>
          <h1>
            What it learned <span className="t-muted">lives on Walrus.</span>
          </h1>
          <p className="lead">
            Every correction and rule is stored in Walrus Memory, not on this server. Chain data comes from Tatum&apos;s Sui gateway.
            Each memory below links to its blob on Walruscan.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head section-head--left">
            <span className="eyebrow">
              <Layers size={14} /> Team memory
            </span>
            {!p ? (
              <h3>Loading…</h3>
            ) : p.error ? (
              <p className="error">{p.error}</p>
            ) : (
              <>
                <h3>
                  {p.total ?? p.count} memories on Walrus mainnet.
                </h3>
                <p className="prose-small" style={{ marginTop: 12 }}>
                  {p.mode !== "walrus" ? (
                    <span className="error">Developer mode: these are not on Walrus.</span>
                  ) : (
                    p.account && (
                      <>
                        Memory account{" "}
                        <a className="t-mono t-accent" href={`https://suiscan.xyz/mainnet/object/${p.account}`} target="_blank" rel="noreferrer">
                          {p.account.slice(0, 10)}…{p.account.slice(-6)}
                        </a>{" "}
                        on Sui mainnet. The table lists the team namespace, which the inbox reads.
                      </>
                    )
                  )}
                </p>
              </>
            )}
          </div>
          {p && !p.error && p.namespaces && (
            <div className="grid grid-3" style={{ marginBottom: 24 }}>
              {p.namespaces.map((n) => (
                <div className="card" key={n.namespace}>
                  <div className="bignum" style={{ fontSize: 48 }}>{n.count}</div>
                  <div className="t-mono t-small" style={{ marginTop: 6 }}>{n.namespace}</div>
                  <p className="t-small" style={{ marginTop: 6 }}>{n.what}</p>
                </div>
              ))}
            </div>
          )}
          {p && !p.error && p.memories.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Stored (UTC)</th>
                    <th>Walrus blob</th>
                  </tr>
                </thead>
                <tbody>
                  {p.memories.slice(0, 30).map((m) => (
                    <tr key={m.blobId}>
                      <td className="t-mono" style={{ whiteSpace: "nowrap" }}>{m.createdAt?.replace("T", " ").slice(0, 16) ?? ""}</td>
                      <td className="t-mono" style={{ overflowWrap: "anywhere" }}>
                        {m.walrus ? (
                          <a href={m.walrus} target="_blank" rel="noreferrer">
                            {m.blobId}
                          </a>
                        ) : (
                          m.blobId
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="section section--alt">
        <div className="container">
          <div className="section-head section-head--left">
            <span className="eyebrow">
              <span className="dot" /> Durability check
            </span>
            <h3>Delete the index. Rebuild it from Walrus.</h3>
            <p className="prose-small" style={{ marginTop: 12 }}>
              The relayer keeps a search index over the memories. This check deletes that index for a test namespace, shows recall
              coming back empty, then rebuilds it from the blobs stored on Walrus and recalls again. Last run on {last.ranOn}, on the{" "}
              {last.where}:
            </p>
          </div>
          <Steps steps={steps ?? (last.steps as Step[])} />
          <div className="composer__actions" style={{ marginTop: 18 }}>
            <input
              className="input"
              type="password"
              style={{ maxWidth: 240 }}
              placeholder="Team passcode"
              aria-label="Team passcode"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy || !pass} onClick={run}>
              {busy ? "Running, about 40 s…" : "Run it again"}
            </button>
            <span className="t-micro">Teammates only, because it uses the shared Walrus quota.</span>
          </div>
        </div>
      </section>
    </>
  );
}
