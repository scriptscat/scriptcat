import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createPreloadableQuery } from "./preloadable-query";

// Regression test: useQuery must not auto-retry on error.
// Before the fix, a persistently-rejecting `load` caused an
// error -> pending -> error effect loop that hammered `load` and
// eventually OOM'd the process.
describe("useQuery error behavior", () => {
  it("does not loop/hammer load when load keeps rejecting", async () => {
    const load = vi.fn(async () => {
      throw new Error("boom");
    });
    const query = createPreloadableQuery<string, string[]>({ key: (k) => k, load });

    const { result } = renderHook(() => query.useQuery("resources"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    await new Promise((r) => setTimeout(r, 100)); // give any runaway loop time to spin

    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.current.status).toBe("error");
  });
});
