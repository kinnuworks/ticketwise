import { describe, expect, it } from "vitest";
import { diagnose, extractRefs, failureKey } from "@/lib/diagnose";
import type { ChainTx } from "@/lib/tatum";

const abortTx: ChainTx = {
  digest: "E9bBUS21ojJ6QAwvgsPXcPUL3SNUQxCAFBeEpHJodFcm",
  sender: "0xcde6dbe01902be1f200ff03dbbd149e586847be8cee15235f82750d9b06c0e04",
  status: "FAILURE",
  timestamp: "2026-11-09T17:04:09.799Z",
  checkpoint: 343426358,
  gasBudget: "70579600",
  gasUsed: "120415",
  error: {
    abortCode: "5",
    module: "big_vector",
    packageAddress: "0xcaf6ba059d539a97646d47f0b9ddf843e138d215e2a12ca1f4585d386f7aec3a",
    fn: "leaf_remove",
    identifier: null,
    constant: null,
    sourceLine: null,
    message: "abort code: 5",
  },
};

describe("diagnose", () => {
  it("turns a Move abort into a stable key", () => {
    const d = diagnose(abortTx, abortTx.digest);
    expect(d.kind).toBe("move_abort");
    expect(d.code).toBe("5");
    expect(d.module).toBe("big_vector");
    expect(d.key).toMatch(/::big_vector#5$/);
    expect(d.summary).toContain("abort code 5");
  });
  it("uses the clever-error name when the chain gives one", () => {
    const d = diagnose({ ...abortTx, error: { ...abortTx.error!, identifier: "ENotFound" } }, abortTx.digest);
    expect(d.summary).toContain("ENotFound");
  });
  it("detects out of gas", () => {
    const d = diagnose({ ...abortTx, error: { ...abortTx.error!, abortCode: null, module: null, message: "InsufficientGas" } }, "x");
    expect(d.kind).toBe("out_of_gas");
  });
  it("handles missing and successful transactions", () => {
    expect(diagnose(null, "x").kind).toBe("not_found");
    expect(diagnose({ ...abortTx, status: "SUCCESS", error: null }, "x").kind).toBe("success");
  });
  it("builds keys without the function name", () => {
    expect(failureKey("deepbook", "pool", "3")).toBe("deepbook::pool#3");
  });
});

describe("extractRefs", () => {
  it("finds digests and addresses in free text", () => {
    const r = extractRefs(`my swap failed E9bBUS21ojJ6QAwvgsPXcPUL3SNUQxCAFBeEpHJodFcm from ${abortTx.sender}!`);
    expect(r.digests).toEqual([abortTx.digest]);
    expect(r.addresses).toEqual([abortTx.sender]);
  });
  it("ignores normal words", () => {
    expect(extractRefs("my swap keeps failing on the app since tuesday").digests).toEqual([]);
  });
});
