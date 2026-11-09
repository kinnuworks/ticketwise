import sc from "@/data/scorecard.json";

type Score = {
  pending?: boolean;
  ranAt: string;
  store: string;
  days: number;
  packages: string[];
  split: { train: number; test: number };
  distinct: { all: number; taught: number; test: number };
  withoutMemory: { answered: number; of: number };
  withMemory: { answered: number; correctMeaning: number; of: number };
  perKey: Record<string, { n: number; answered: number; taughtEarlier: boolean; constant: string | null }>;
};

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");

export default function Scorecard() {
  const s = sc as unknown as Score;
  if (s.pending) {
    return (
      <>
        <h1>Replay scorecard</h1>
        <p className="lede">The replay has not been run yet.</p>
      </>
    );
  }
  const rows = Object.entries(s.perKey).sort((a, b) => b[1].n - a[1].n);
  return (
    <>
      <h1>Replay scorecard</h1>
      <p className="lede">
        Real failed mainnet transactions from {s.packages.join(", ")}, read through Tatum over {s.days} days. The earlier{" "}
        {s.split.train} failures taught Ticketwise one correction per distinct error (meaning taken from the contract&apos;s own
        source). The later {s.split.test} failures were then triaged with memory off and on.
      </p>
      <div className="row" style={{ gap: 16 }}>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <div className="muted small">Memory off</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{pct(s.withoutMemory.answered, s.withoutMemory.of)}</div>
          <div className="small">of later tickets answered with what the team taught ({s.withoutMemory.answered} of {s.withoutMemory.of})</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <div className="muted small">Memory on (Walrus Memory)</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{pct(s.withMemory.answered, s.withMemory.of)}</div>
          <div className="small">
            answered from a teammate&apos;s correction ({s.withMemory.answered} of {s.withMemory.of}); {s.withMemory.correctMeaning} with the
            right meaning
          </div>
        </div>
      </div>
      <h2>Per error</h2>
      <p className="small muted">
        {s.distinct.all} distinct errors in the replay. {s.distinct.taught} were seen and taught in the earlier part. Errors that only
        appear later stay unanswered until someone teaches them, and the table shows that honestly.
      </p>
      <table>
        <thead>
          <tr><th>Error</th><th>Source name</th><th>Later tickets</th><th>Answered from memory</th><th>Taught earlier?</th></tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="mono">{k}</td>
              <td className="mono">{v.constant ?? "unknown"}</td>
              <td>{v.n}</td>
              <td>{v.answered}</td>
              <td>{v.taughtEarlier ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Run {s.ranAt} against {s.store === "walrus" ? "Walrus Memory on Sui mainnet" : "a local test store"}. Script: scripts/run-scorecard.mts.</p>
    </>
  );
}
