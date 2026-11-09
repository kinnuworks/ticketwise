"use client";
import { useEffect, useState } from "react";

type Proof = { mode: string; namespace: string; account: string | null; count: number; memories: { blobId: string; createdAt: string | null; walrus: string | null }[]; error?: string };
type Step = { step: string; ok: boolean; detail: string; ms: number };

export default function ProofPage() {
  const [p, setP] = useState<Proof | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/proof").then((r) => r.json()).then(setP).catch(() => {});
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
      <h1>Proof</h1>
      <p className="lede">What Ticketwise knows lives in Walrus Memory on Sui mainnet, not in this server. Chain data comes from Tatum&apos;s Sui gateway.</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Team memory</h2>
        {!p ? <p className="muted">Loading…</p> : p.error ? <p className="error">{p.error}</p> : (
          <>
            <p>
              <strong>{p.count}</strong> memories in namespace <span className="mono">{p.namespace}</span>
              {p.account && <> on account <a className="mono" href={`https://suiscan.xyz/mainnet/object/${p.account}`} target="_blank" rel="noreferrer">{p.account}</a></>}
              {p.mode !== "walrus" && <span className="error"> (developer mode, not Walrus)</span>}
            </p>
            <table>
              <thead><tr><th>Stored</th><th>Walrus blob</th></tr></thead>
              <tbody>
                {p.memories.slice(0, 30).map((m) => (
                  <tr key={m.blobId}><td className="small">{m.createdAt?.replace("T", " ").slice(0, 16) ?? ""}</td><td className="mono">{m.walrus ? <a href={m.walrus} target="_blank" rel="noreferrer">{m.blobId}</a> : m.blobId}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Durability check</h2>
        <p className="small">Wipes the relayer&apos;s search index for a test namespace, shows recall comes back empty, rebuilds the index from the blobs stored on Walrus, and recalls again. Teammates only, because it uses the shared quota.</p>
        <div className="row"><input type="password" style={{ maxWidth: 220 }} placeholder="Team passcode" value={pass} onChange={(e) => setPass(e.target.value)} /><button disabled={busy || !pass} onClick={run}>{busy ? "Running…" : "Run check"}</button></div>
        {steps && (
          <table style={{ marginTop: 12 }}>
            <tbody>{steps.map((s, i) => <tr key={i}><td>{s.ok ? "✓" : "✗"} {s.step}</td><td>{s.detail}</td><td className="muted small">{s.ms} ms</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
