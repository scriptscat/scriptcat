import { useCallback, useEffect, useRef, useState } from "react";
import { mcpClient } from "@App/pages/store/features/script";

export type PendingPairingView = Awaited<ReturnType<typeof mcpClient.getPendingPairing>>;
export type McpScope = NonNullable<PendingPairingView>["requestedScopes"][number];

export const SCOPE_ORDER: McpScope[] = [
  "scripts:list",
  "scripts:metadata:read",
  "scripts:source:read",
  "scripts:install:request",
  "scripts:toggle:request",
  "scripts:delete:request",
];

// scripts:list / scripts:metadata:read default on when requested; every write-capable scope
// (including source read, which can expose secrets) defaults off, so the human has to actively
// opt each one in rather than accidentally granting a write/read-source scope by not noticing it.
export const SCOPE_DEFAULT_ON: Record<McpScope, boolean> = {
  "scripts:list": true,
  "scripts:metadata:read": true,
  "scripts:source:read": false,
  "scripts:install:request": false,
  "scripts:toggle:request": false,
  "scripts:delete:request": false,
};

export const SCOPE_LABEL_KEY: Record<McpScope, string> = {
  "scripts:list": "mcp:scope_list",
  "scripts:metadata:read": "mcp:scope_metadata",
  "scripts:source:read": "mcp:scope_source",
  "scripts:install:request": "mcp:scope_install",
  "scripts:toggle:request": "mcp:scope_toggle",
  "scripts:delete:request": "mcp:scope_delete",
};

export const WRITE_SCOPES = new Set<McpScope>([
  "scripts:install:request",
  "scripts:toggle:request",
  "scripts:delete:request",
]);

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Shared pairing-decision state machine, reused by the standalone mcp_confirm.html?pairing=<id>
 * popup and the in-page options-tab dialog (McpSection.tsx) — a pairing request can be decided
 * from either surface, whichever the human happens to have open.
 * One fetch, not a poll: whichever surface renders this hook is the only decision surface for a
 * given pairingId, so there's nothing external that could change the pending pairing snapshot
 * after it loads. The countdown below owns secondsLeft from here on.
 */
export function usePendingPairing(pairingId: string, onDecided?: () => void) {
  const [pairing, setPairing] = useState<PendingPairingView>();
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Set<McpScope>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(0);
  const decidedRef = useRef(false);
  const onDecidedRef = useRef(onDecided);
  useEffect(() => {
    onDecidedRef.current = onDecided;
  }, [onDecided]);

  useEffect(() => {
    let cancelled = false;
    mcpClient
      .getPendingPairing()
      .then((result) => {
        if (cancelled) return;
        if (!result || result.pairingId !== pairingId) {
          setLoadError(true);
          return;
        }
        setPairing(result);
        setSelected(
          new Set(result.requestedScopes.filter((scope) => SCOPE_DEFAULT_ON[scope as McpScope]) as McpScope[])
        );
        setSecondsLeft(Math.max(0, Math.round((result.expiresAt - Date.now()) / 1000)));
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [pairingId]);

  // Returns a promise so callers can react once the decision round-trips (close the standalone
  // popup, dismiss the in-page dialog) — resolves immediately as a no-op on a repeat call.
  // onDecided also fires for the auto-timeout reject below, which no caller-side click triggers.
  const decide = useCallback(
    (approved: boolean): Promise<void> => {
      if (decidedRef.current) return Promise.resolve();
      decidedRef.current = true;
      return mcpClient
        .decidePairing({ pairingId, approved, grantedScopes: approved ? Array.from(selected) : [] })
        .then(() => {
          onDecidedRef.current?.();
        });
    },
    [pairingId, selected]
  );

  useEffect(() => {
    if (!pairing || secondsLeft <= 0) return;
    if (secondsLeft <= 1) {
      void decide(false);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [pairing, secondsLeft, decide]);

  const toggleScope = (scope: McpScope, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(scope);
      else next.delete(scope);
      return next;
    });
  };

  return { pairing, loadError, selected, secondsLeft, decide, toggleScope };
}
