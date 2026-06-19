import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

type PreloadStatus = "idle" | "pending" | "success" | "error";

export type PreloadSnapshot<T> = {
  status: PreloadStatus;
  data: T | undefined;
  error: unknown;
  isIdle: boolean;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
};

type Slot<K, T> = {
  key: K;
  keyString: string;
  seq: number;
  status: PreloadStatus;
  data: T | undefined;
  error: unknown;
  promise: Promise<T> | null;
  controller: AbortController | null;
  snapshot: PreloadSnapshot<T>;
};

export type CreatePreloadableQueryOptions<K, T> = {
  /**
   * Converts the external key into a stable comparable string.
   *
   * Example:
   *   key: (uuid) => uuid
   *   key: ({ projectId, tab }) => `${projectId}:${tab}`
   */
  key: (key: K) => string;

  /**
   * Loads data for the current key.
   *
   * The signal is aborted when a newer key replaces the current key,
   * or when invalidate/reload cancels the current request.
   */
  load: (key: K, signal: AbortSignal) => Promise<T>;
};

export type UsePreloadableQueryOptions = {
  /**
   * When false, the hook subscribes to the current snapshot but does not start loading.
   */
  enabled?: boolean;
};

export type UsePreloadableQueryResult<T> = PreloadSnapshot<T> & {
  preload: () => Promise<T>;
  reload: () => Promise<T>;
  invalidate: () => void;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
};

const IDLE_SNAPSHOT: PreloadSnapshot<never> = {
  status: "idle",
  data: undefined,
  error: undefined,
  isIdle: true,
  isPending: false,
  isSuccess: false,
  isError: false,
};

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (typeof e === "object" &&
      e !== null &&
      ("name" in e || "message" in e) &&
      (("name" in e && e.name === "AbortError") ||
        ("message" in e && typeof e.message === "string" && e.message.toLowerCase() === "canceled")))
  );
}

function idleSnapshot<T>(): PreloadSnapshot<T> {
  return IDLE_SNAPSHOT as PreloadSnapshot<T>;
}

function makeSnapshot<T>(status: PreloadStatus, data: T | undefined, error: unknown): PreloadSnapshot<T> {
  return {
    status,
    data,
    error,
    isIdle: status === "idle",
    isPending: status === "pending",
    isSuccess: status === "success",
    isError: status === "error",
  };
}

function updateSnapshot<T>(slot: Slot<unknown, T>) {
  slot.snapshot = makeSnapshot(slot.status, slot.data, slot.error);
}

/**
 * Creates a latest-only preloadable request coordinator.
 *
 * It is intentionally NOT a multi-key cache:
 * - only one key is current
 * - same key reuses the current pending/success result
 * - new key aborts/discards the previous record
 * - switching back to an old key fetches again
 *
 * This is useful when a parent wants to call `preload(key)` before a component mounts,
 * while the component later consumes the same request through `useQuery(key)`.
 */
export function createPreloadableQuery<K, T>(options: CreatePreloadableQueryOptions<K, T>) {
  let slot: Slot<K, T> | null = null;
  let seq = 0;
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  function keyStringOf(key: K): string {
    return options.key(key);
  }

  function isCurrentKey(key: K): boolean {
    return slot?.keyString === keyStringOf(key);
  }

  function abortCurrent() {
    slot?.controller?.abort();
  }

  function createSlot(key: K): Slot<K, T> {
    abortCurrent();

    const next: Slot<K, T> = {
      key,
      keyString: keyStringOf(key),
      seq: ++seq,
      status: "idle",
      data: undefined,
      error: undefined,
      promise: null,
      controller: null,
      snapshot: idleSnapshot<T>(),
    };

    slot = next;
    emit();

    return next;
  }

  function getCurrentSnapshot(key: K): PreloadSnapshot<T> {
    if (!isCurrentKey(key)) return idleSnapshot<T>();
    return slot?.snapshot ?? idleSnapshot<T>();
  }

  function ensure(key: K): Promise<T> {
    const keyString = keyStringOf(key);

    if (slot?.keyString === keyString) {
      if (slot.status === "pending" && slot.promise) {
        return slot.promise;
      }

      if (slot.status === "success" && slot.data !== undefined) {
        return Promise.resolve(slot.data);
      }
    }

    const current = slot?.keyString === keyString ? slot : createSlot(key);
    const controller = new AbortController();
    const currentSeq = current.seq;

    current.status = "pending";
    current.error = undefined;
    current.controller = controller;
    updateSnapshot(current);
    emit();

    const promise = options
      .load(key, controller.signal)
      .then((data) => {
        if (slot !== current || current.seq !== currentSeq) {
          return data;
        }

        current.status = "success";
        current.data = data;
        current.error = undefined;
        current.promise = null;
        current.controller = null;
        updateSnapshot(current);
        emit();

        return data;
      })
      .catch((e) => {
        if (slot !== current || current.seq !== currentSeq) {
          throw e;
        }

        current.promise = null;
        current.controller = null;

        if (isAbortError(e)) {
          current.status = "idle";
          current.error = undefined;
        } else {
          current.status = "error";
          current.error = e;
        }

        updateSnapshot(current);
        emit();
        throw e;
      });

    current.promise = promise;
    return promise;
  }

  function preload(key: K): Promise<T> {
    return ensure(key);
  }

  function reload(key: K): Promise<T> {
    createSlot(key);
    return ensure(key);
  }

  function invalidate(key?: K) {
    if (key !== undefined && !isCurrentKey(key)) return;

    abortCurrent();
    slot = null;
    emit();
  }

  function setData(key: K, updater: T | ((prev: T | undefined) => T)) {
    const keyString = keyStringOf(key);

    if (!slot || slot.keyString !== keyString) {
      slot = {
        key,
        keyString,
        seq: ++seq,
        status: "idle",
        data: undefined,
        error: undefined,
        promise: null,
        controller: null,
        snapshot: idleSnapshot<T>(),
      };
    }

    const nextData = typeof updater === "function" ? (updater as (prev: T | undefined) => T)(slot.data) : updater;

    slot.status = "success";
    slot.data = nextData;
    slot.error = undefined;
    slot.promise = null;
    slot.controller = null;
    updateSnapshot(slot);
    emit();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  function useQuery(key: K, hookOptions: UsePreloadableQueryOptions = {}): UsePreloadableQueryResult<T> {
    const enabled = hookOptions.enabled ?? true;
    const keyString = keyStringOf(key);

    const getSnapshot = useCallback(() => getCurrentSnapshot(key), [keyString]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
      if (!enabled) return;

      // Auto-load only from idle. Do NOT auto-retry on "error": the effect
      // re-runs on every snapshot.status change, so retrying here would loop
      // error -> pending -> error forever. Errors are surfaced in the snapshot
      // and retried explicitly via reload()/preload(). A key change still
      // auto-loads because a non-current key reports "idle".
      if (snapshot.status === "idle") {
        void ensure(key).catch(() => {
          // The error is reflected in the external-store snapshot.
        });
      }
    }, [enabled, keyString, snapshot.status]);

    return useMemo(
      () => ({
        ...snapshot,
        preload: () => preload(key),
        reload: () => reload(key),
        invalidate: () => invalidate(key),
        setData: (updater: T | ((prev: T | undefined) => T)) => setData(key, updater),
      }),
      [snapshot, keyString]
    );
  }

  return {
    preload,
    ensure,
    reload,
    invalidate,
    setData,
    getSnapshot: getCurrentSnapshot,
    subscribe,
    useQuery,
  };
}
