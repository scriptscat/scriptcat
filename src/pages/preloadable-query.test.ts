import { describe, expect, it, vi } from "vitest";
import { createPreloadableQuery } from "./preloadable-query";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("createPreloadableQuery", () => {
  it("keeps getSnapshot referentially stable between store changes", () => {
    const query = createPreloadableQuery<string, string[]>({
      key: (key) => key,
      load: vi.fn(),
    });

    expect(query.getSnapshot("missing")).toBe(query.getSnapshot("missing"));

    query.setData("resources", ["a"]);

    const successSnapshot = query.getSnapshot("resources");
    expect(successSnapshot).toBe(query.getSnapshot("resources"));
    expect(successSnapshot).toMatchObject({
      status: "success",
      data: ["a"],
      isSuccess: true,
    });

    expect(query.getSnapshot("other")).toBe(query.getSnapshot("other"));
  });

  it("dedupes same-key pending preload calls and reuses successful data", async () => {
    const request = deferred<string[]>();
    const load = vi.fn(() => request.promise);
    const query = createPreloadableQuery<string, string[]>({
      key: (key) => key,
      load,
    });

    const first = query.preload("resources");
    const second = query.preload("resources");

    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
    expect(query.getSnapshot("resources")).toMatchObject({ status: "pending", isPending: true });

    request.resolve(["a", "b"]);
    await expect(first).resolves.toEqual(["a", "b"]);

    await expect(query.preload("resources")).resolves.toEqual(["a", "b"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(query.getSnapshot("resources")).toMatchObject({
      status: "success",
      data: ["a", "b"],
      isSuccess: true,
    });
  });

  it("switching keys aborts the previous current request and discards its snapshot", async () => {
    const requests = new Map<string, ReturnType<typeof deferred<string[]>>>();
    const signals = new Map<string, AbortSignal>();
    const load = vi.fn((key: string, signal: AbortSignal) => {
      const request = deferred<string[]>();
      requests.set(key, request);
      signals.set(key, signal);
      return request.promise;
    });
    const query = createPreloadableQuery<string, string[]>({
      key: (key) => key,
      load,
    });

    const oldRequest = query.preload("old");
    const newRequest = query.preload("new");

    expect(load).toHaveBeenCalledTimes(2);
    expect(signals.get("old")?.aborted).toBe(true);
    expect(signals.get("new")?.aborted).toBe(false);
    expect(query.getSnapshot("old")).toMatchObject({ status: "idle", isIdle: true });
    expect(query.getSnapshot("new")).toMatchObject({ status: "pending", isPending: true });

    requests.get("old")?.resolve(["stale"]);
    requests.get("new")?.resolve(["fresh"]);

    await expect(oldRequest).resolves.toEqual(["stale"]);
    await expect(newRequest).resolves.toEqual(["fresh"]);
    expect(query.getSnapshot("new")).toMatchObject({ status: "success", data: ["fresh"] });
  });

  it("reload starts a fresh request for the same key", async () => {
    const requests: Array<ReturnType<typeof deferred<string[]>>> = [];
    const signals: AbortSignal[] = [];
    const load = vi.fn((_key: string, signal: AbortSignal) => {
      const request = deferred<string[]>();
      requests.push(request);
      signals.push(signal);
      return request.promise;
    });
    const query = createPreloadableQuery<string, string[]>({
      key: (key) => key,
      load,
    });

    void query.preload("resources");
    const reloaded = query.reload("resources");

    expect(load).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    requests[1].resolve(["fresh"]);
    await expect(reloaded).resolves.toEqual(["fresh"]);
    expect(query.getSnapshot("resources")).toMatchObject({ status: "success", data: ["fresh"] });
  });

  it("setData updates the current snapshot and notifies subscribers", () => {
    const query = createPreloadableQuery<string, string[]>({
      key: (key) => key,
      load: vi.fn(),
    });
    const listener = vi.fn();
    const unsubscribe = query.subscribe(listener);

    query.setData("resources", ["a"]);
    query.setData("resources", (prev) => [...(prev ?? []), "b"]);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(query.getSnapshot("resources")).toMatchObject({
      status: "success",
      data: ["a", "b"],
      isSuccess: true,
    });

    unsubscribe();
    query.setData("resources", []);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("invalidate only clears the current key when the optional key matches", () => {
    const query = createPreloadableQuery<string, string[]>({
      key: (key) => key,
      load: vi.fn(),
    });

    query.setData("resources", ["a"]);
    query.invalidate("other");
    expect(query.getSnapshot("resources")).toMatchObject({ status: "success", data: ["a"] });

    query.invalidate("resources");
    expect(query.getSnapshot("resources")).toMatchObject({ status: "idle", data: undefined });
  });
});
