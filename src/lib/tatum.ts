// Reads Sui mainnet through Tatum's gateway (Sui GraphQL served by Tatum).
// Sui's JSON-RPC is gone, so every chain read here goes over GraphQL.

export const TATUM_SUI_GRAPHQL = "https://sui-mainnet.gateway.tatum.io/graphql";

export type ChainError = {
  abortCode: string | null;
  module: string | null;
  packageAddress: string | null;
  fn: string | null;
  identifier: string | null;
  constant: string | null;
  sourceLine: number | null;
  message: string | null;
};

export type ChainTx = {
  digest: string;
  sender: string | null;
  status: "SUCCESS" | "FAILURE" | string;
  timestamp: string | null;
  checkpoint: number | null;
  error: ChainError | null;
  gasBudget: string | null;
  gasUsed: string | null;
};

let callCount = 0;
export function tatumCallCount() {
  return callCount;
}

export async function tatumGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.TATUM_API_KEY) headers["x-api-key"] = process.env.TATUM_API_KEY;
  callCount++;
  const res = await fetch(TATUM_SUI_GRAPHQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (res.status === 429) throw new TatumError("Tatum rate limit reached. Try again in a minute.", 429);
  if (!res.ok) throw new TatumError(`Tatum gateway returned ${res.status}`, res.status);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new TatumError(json.errors.map((e) => e.message).join("; "), 400);
  if (!json.data) throw new TatumError("Tatum gateway returned no data", 502);
  return json.data;
}

export class TatumError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const TX_FIELDS = `
  digest
  sender { address }
  gasInput { gasBudget }
  effects {
    status
    timestamp
    checkpoint { sequenceNumber }
    gasEffects { gasSummary { computationCost storageCost storageRebate } }
    executionError {
      abortCode
      identifier
      constant
      sourceLineNumber
      message
      module { name package { address } }
      function { name }
    }
  }
`;

type RawTx = {
  digest: string;
  sender: { address: string } | null;
  gasInput: { gasBudget: string | null } | null;
  effects: {
    status: string;
    timestamp: string | null;
    checkpoint: { sequenceNumber: number } | null;
    gasEffects: { gasSummary: { computationCost: string; storageCost: string; storageRebate: string } | null } | null;
    executionError: {
      abortCode: string | null;
      identifier: string | null;
      constant: string | null;
      sourceLineNumber: number | null;
      message: string | null;
      module: { name: string; package: { address: string } | null } | null;
      function: { name: string } | null;
    } | null;
  } | null;
};

export function normaliseTx(raw: RawTx): ChainTx {
  const e = raw.effects?.executionError ?? null;
  const g = raw.effects?.gasEffects?.gasSummary;
  const used = g ? BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate) : null;
  return {
    digest: raw.digest,
    sender: raw.sender?.address ?? null,
    status: raw.effects?.status ?? "UNKNOWN",
    timestamp: raw.effects?.timestamp ?? null,
    checkpoint: raw.effects?.checkpoint?.sequenceNumber ?? null,
    gasBudget: raw.gasInput?.gasBudget ?? null,
    gasUsed: used === null ? null : used.toString(),
    error: e
      ? {
          abortCode: e.abortCode,
          module: e.module?.name ?? null,
          packageAddress: e.module?.package?.address ?? null,
          fn: e.function?.name ?? null,
          identifier: e.identifier,
          constant: e.constant,
          sourceLine: e.sourceLineNumber,
          message: e.message,
        }
      : null,
  };
}

export async function getTransaction(digest: string): Promise<ChainTx | null> {
  const data = await tatumGraphql<{ transaction: RawTx | null }>(
    `query($d: String!) { transaction(digest: $d) { ${TX_FIELDS} } }`,
    { d: digest },
  );
  return data.transaction ? normaliseTx(data.transaction) : null;
}

export async function latestCheckpoint(): Promise<number> {
  const data = await tatumGraphql<{ checkpoint: { sequenceNumber: number } }>(`{ checkpoint { sequenceNumber } }`);
  return data.checkpoint.sequenceNumber;
}

// Failed transactions sent by an address (for tickets that give an address, not a digest).
export async function recentTxsBySender(address: string, afterCheckpoint: number): Promise<ChainTx[]> {
  const data = await tatumGraphql<{ transactions: { nodes: RawTx[] } }>(
    `query($a: SuiAddress!, $c: UInt53!) { transactions(last: 20, filter: { sentAddress: $a, afterCheckpoint: $c }) { nodes { ${TX_FIELDS} } } }`,
    { a: address, c: afterCheckpoint },
  );
  return data.transactions.nodes.map(normaliseTx);
}

// Transactions that call a package, inside a checkpoint window (the bound is required on Tatum).
export async function txsCallingPackage(pkg: string, afterCheckpoint: number, beforeCheckpoint: number, first = 50): Promise<ChainTx[]> {
  const data = await tatumGraphql<{ transactions: { nodes: RawTx[] } }>(
    `query($p: String!, $a: UInt53!, $b: UInt53!, $n: Int!) { transactions(first: $n, filter: { function: $p, afterCheckpoint: $a, beforeCheckpoint: $b }) { nodes { ${TX_FIELDS} } } }`,
    { p: pkg, a: afterCheckpoint, b: beforeCheckpoint, n: first },
  );
  return data.transactions.nodes.map(normaliseTx);
}
