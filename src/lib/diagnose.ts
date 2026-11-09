import type { ChainTx } from "./tatum";
import maps from "@/data/error-maps.json";

export type SourceEntry = { constant: string; meaning?: string; source: string };
type PackageMap = {
  key: string;
  name: string;
  addresses: string[];
  errors: Record<string, Record<string, SourceEntry>>;
};

const PACKAGES = (maps as unknown as { packages: PackageMap[] }).packages;

export type FailureKind = "move_abort" | "out_of_gas" | "other_failure" | "success" | "not_found";

export type Diagnosis = {
  digest: string;
  sender: string | null;
  timestamp: string | null;
  kind: FailureKind;
  // Stable key for one kind of failure: package::module#code. Function is context, not identity.
  key: string | null;
  packageKey: string | null;
  packageName: string | null;
  packageAddress: string | null;
  module: string | null;
  fn: string | null;
  code: string | null;
  sourceEntry: SourceEntry | null;
  summary: string; // what happened on chain, in plain words, before any team knowledge
};

export function shortAddr(a: string | null): string {
  if (!a) return "unknown";
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function findPackage(address: string | null): PackageMap | null {
  if (!address) return null;
  const a = address.toLowerCase();
  return PACKAGES.find((p) => p.addresses.some((x) => x.toLowerCase() === a)) ?? null;
}

export function failureKey(pkgKey: string, module: string, code: string): string {
  return `${pkgKey}::${module}#${code}`;
}

export function diagnose(tx: ChainTx | null, digest: string): Diagnosis {
  const base = {
    digest,
    sender: tx?.sender ?? null,
    timestamp: tx?.timestamp ?? null,
    key: null,
    packageKey: null,
    packageName: null,
    packageAddress: null,
    module: null,
    fn: null,
    code: null,
    sourceEntry: null,
  };
  if (!tx) {
    return {
      ...base,
      kind: "not_found",
      summary:
        "No transaction with this digest on Sui mainnet. It may be mistyped, from another network, or older than the node's history.",
    };
  }
  if (tx.status === "SUCCESS") {
    return { ...base, kind: "success", summary: "This transaction succeeded on chain. The problem is likely in the app, not the chain." };
  }
  const e = tx.error;
  if (e && e.abortCode !== null && e.module) {
    const pkg = findPackage(e.packageAddress);
    const pkgKey = pkg?.key ?? (e.packageAddress ? `pkg-${e.packageAddress.replace(/^0x/, "").slice(0, 10)}` : "unknown");
    const entry = pkg?.errors?.[e.module]?.[e.abortCode] ?? null;
    const constant = e.identifier ?? e.constant ?? entry?.constant ?? null;
    const where = `${pkg?.name ?? `package ${shortAddr(e.packageAddress)}`}, module ${e.module}${e.fn ? `, function ${e.fn}` : ""}`;
    return {
      ...base,
      kind: "move_abort",
      key: failureKey(pkgKey, e.module, e.abortCode),
      packageKey: pkgKey,
      packageName: pkg?.name ?? null,
      packageAddress: e.packageAddress,
      module: e.module,
      fn: e.fn,
      code: e.abortCode,
      sourceEntry: entry ?? (constant ? { constant, source: "" } : null),
      summary: `The app's smart contract stopped the transaction on purpose: abort code ${e.abortCode} in ${where}${
        constant ? `. The contract source names this error ${constant}` : ""
      }. No funds moved except the gas fee.`,
    };
  }
  const msg = e?.message ?? "";
  if (/gas/i.test(msg) || (tx.gasBudget && tx.gasUsed && BigInt(tx.gasUsed) >= BigInt(tx.gasBudget))) {
    return {
      ...base,
      kind: "out_of_gas",
      key: "sui::gas#out_of_gas",
      summary: "The transaction ran out of gas before it finished. Nothing changed except the gas fee.",
    };
  }
  return {
    ...base,
    kind: "other_failure",
    key: msg ? `sui::execution#${msg.split(/[\s(:]/)[0].slice(0, 40)}` : null,
    summary: msg ? `The transaction failed on chain: ${msg}` : "The transaction failed on chain without an abort code.",
  };
}

// Pull a digest or address out of whatever the user typed.
export function extractRefs(text: string): { digests: string[]; addresses: string[] } {
  const digests = [...new Set(text.match(/\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/g) ?? [])];
  const addresses = [...new Set(text.match(/\b0x[0-9a-fA-F]{64}\b/g) ?? [])];
  return { digests, addresses };
}
