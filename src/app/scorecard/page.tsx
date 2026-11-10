import sc from "@/data/scorecard.json";
import cv from "@/data/curve.json";

type Curve = { days: { day: string; tickets: number; answered: number; newErrors: number; pct: number }[]; total: { tickets: number; answered: number; pct: number }; distinctErrors: number };

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
  return (
    <>
      <section className="hero hero--color hero--app hero--sub">
        <div className="container">
          <span className="badge badge--dot">Replay on Sui mainnet data</span>
          <h1>
            Same errors, <span className="t-muted">right answers.</span>
          </h1>
          {s.pending ? (
            <p className="lead">The replay hasn&apos;t been run yet.</p>
          ) : (
            <p className="lead">
              {s.split.train + s.split.test} real failed transactions from {s.packages.join(", ")}, read through Tatum over {s.days}{" "}
              days. The first {s.split.train} taught Ticketwise. The last {s.split.test} were answered with memory off and on.
            </p>
          )}
        </div>
      </section>

      {!s.pending && (
        <>
          <section className="section">
            <div className="container">
              <div className="compare">
                <div className="card">
                  <div className="t-micro">Memory off</div>
                  <div className="bignum bignum--muted">{pct(s.withoutMemory.answered, s.withoutMemory.of)}</div>
                  <p className="t-small">
                    {s.withoutMemory.answered} of {s.withoutMemory.of} later tickets answered with what the team taught. Without
                    memory it can only explain the abort code.
                  </p>
                </div>
                <div className="card card--chosen">
                  <div className="t-micro">Memory on, from Walrus Memory</div>
                  <div className="bignum">{pct(s.withMemory.answered, s.withMemory.of)}</div>
                  <p className="t-small">
                    {s.withMemory.answered} of {s.withMemory.of} answered from a teammate&apos;s correction, {s.withMemory.correctMeaning}{" "}
                    with the right meaning.
                  </p>
                </div>
              </div>
            </div>
          </section>


          <section className="section section--alt">
            <div className="container">
              <div className="section-head section-head--left">
                <span className="eyebrow">
                  <span className="dot" /> Learning curve, from empty memory
                </span>
                <h3>Day one knows nothing. Day two answers almost everything.</h3>
                <p className="prose-small" style={{ marginTop: 12 }}>
                  The same {(cv as Curve).total.tickets} failures, played forward one day at a time against a fresh Walrus Memory
                  namespace. Each day&apos;s tickets are answered only from corrections taught on earlier days; at the end of the day the
                  team teaches each new error once. {(cv as Curve).total.answered} of {(cv as Curve).total.tickets} tickets (
                  {(cv as Curve).total.pct}%) were answered from memory with {(cv as Curve).distinctErrors} corrections. Tickets for an error
                  nobody had taught yet count as unanswered.
                </p>
              </div>
              <div className="curve">
                {(cv as Curve).days.map((d) => (
                  <div className="curve__col" key={d.day}>
                    <span className="curve__pct t-mono">{d.pct}%</span>
                    <div className="curve__bar">
                      <div className="curve__fill" style={{ height: `${Math.max(d.pct, 2)}%` }} />
                    </div>
                    <span className="curve__day t-mono">{d.day.slice(5)}</span>
                    {d.newErrors > 0 && <span className="curve__new">+{d.newErrors} taught</span>}
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="section">
            <div className="container">
              <div className="section-head section-head--left">
                <span className="eyebrow">
                  <span className="dot" /> Per error
                </span>
                <h3>How the replay was run.</h3>
                <p className="prose-small" style={{ marginTop: 14 }}>
                  The failures are split by time, so nothing from the later part leaks into teaching. For each distinct error in the
                  earlier part, one correction was saved to Walrus Memory, with its meaning taken from the contract&apos;s own source.
                  The replay found {s.distinct.all} distinct errors, and {s.distinct.taught} were taught. All {s.distinct.test} errors in
                  the later part had already appeared earlier, so every later ticket had a correction to draw on. An error that only
                  shows up later would stay unanswered until someone teaches it.
                </p>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Error</th>
                      <th>Name in contract source</th>
                      <th className="num">Later tickets</th>
                      <th className="num">Answered from memory</th>
                      <th>Taught earlier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(s.perKey)
                      .sort((a, b) => b[1].n - a[1].n)
                      .map(([k, v]) => (
                        <tr key={k}>
                          <td className="t-mono">{k}</td>
                          <td className="t-mono">{v.constant ?? "unknown"}</td>
                          <td className="num">{v.n}</td>
                          <td className="num">{v.answered}</td>
                          <td>{v.taughtEarlier ? <span className="check">Yes</span> : <span className="cross">No</span>}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="t-micro" style={{ marginTop: 14 }}>
                Run {s.ranAt.slice(0, 16).replace("T", " ")} UTC against{" "}
                {s.store === "walrus" ? "Walrus Memory on Sui mainnet" : "a local test store"}. Script: scripts/run-scorecard.mts.
              </p>
            </div>
          </section>
        </>
      )}
    </>
  );
}
