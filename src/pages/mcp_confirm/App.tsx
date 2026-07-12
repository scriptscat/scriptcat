import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, CircleAlert } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { notify } from "@App/pages/components/ui/toast";
import { mcpClient, scriptClient } from "@App/pages/store/features/script";
import type { Script } from "@App/app/repo/scripts";
import { cn } from "@App/pkg/utils/cn";

type OperationView = Awaited<ReturnType<typeof mcpClient.getOperation>>;
type PendingPairingView = Awaited<ReturnType<typeof mcpClient.getPendingPairing>>;
type McpScope = NonNullable<PendingPairingView>["requestedScopes"][number];

const SCOPE_ORDER: McpScope[] = [
  "scripts:list",
  "scripts:metadata:read",
  "scripts:source:read",
  "scripts:install:request",
  "scripts:toggle:request",
  "scripts:delete:request",
];

// scripts:list / scripts:metadata:read default on when requested; every write-capable scope
// (including source read, which can expose secrets) defaults off (doc 07 §3).
const SCOPE_DEFAULT_ON: Record<McpScope, boolean> = {
  "scripts:list": true,
  "scripts:metadata:read": true,
  "scripts:source:read": false,
  "scripts:install:request": false,
  "scripts:toggle:request": false,
  "scripts:delete:request": false,
};

const SCOPE_LABEL_KEY: Record<McpScope, string> = {
  "scripts:list": "mcp:scope_list",
  "scripts:metadata:read": "mcp:scope_metadata",
  "scripts:source:read": "mcp:scope_source",
  "scripts:install:request": "mcp:scope_install",
  "scripts:toggle:request": "mcp:scope_toggle",
  "scripts:delete:request": "mcp:scope_delete",
};

const WRITE_SCOPES = new Set<McpScope>(["scripts:install:request", "scripts:toggle:request", "scripts:delete:request"]);

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// enable/disable/delete only — source-disclosure consent-gating (doc 02 §4.2) is not yet
// implemented server-side (scripts.source.get in mcp/bridge.ts reads directly, no pending
// operation created for it), so there is no such operation kind for this page to render yet.
// Tracked as a follow-up; documented rather than building UI for a flow the backend can't emit.
type SupportedKind = "enable" | "disable" | "delete";

const HOLD_TO_CONFIRM_MS = 1500;

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="size-6 shrink-0" />
      <span className="text-[15px] font-semibold text-foreground">{"ScriptCat"}</span>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="mcp-confirm-shell"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10"
    >
      <BrandMark />
      {children}
    </div>
  );
}

const cardClass = "flex w-full max-w-[480px] flex-col gap-5 rounded-2xl border bg-card p-7 shadow-lg";

/** Press-and-hold button that fires onConfirm after HOLD_TO_CONFIRM_MS of continuous hold. */
function HoldToConfirmButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const start = () => {
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(1, elapsed / HOLD_TO_CONFIRM_MS);
      setProgress(pct);
      if (pct >= 1) {
        onConfirm();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const cancel = () => {
    cancelAnimationFrame(frameRef.current);
    setProgress(0);
  };

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  return (
    <Button
      variant="destructive"
      size="lg"
      data-testid="mcp-confirm-hold"
      className="relative w-full overflow-hidden font-semibold"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
    >
      <span
        className="absolute inset-y-0 left-0 bg-destructive-foreground/25"
        style={{ width: `${progress * 100}%` }}
        aria-hidden="true"
      />
      <span className="relative">{label}</span>
    </Button>
  );
}

export function McpConfirmView({ operationId }: { operationId: string }) {
  const { t } = useTranslation(["mcp", "common"]);
  const [op, setOp] = useState<OperationView>();
  const [script, setScript] = useState<Script | null | undefined>();
  const [loadError, setLoadError] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    mcpClient
      .getOperation(operationId)
      .then((result) => {
        if (cancelled) return;
        if (!result || result.status !== "awaiting_user") {
          setLoadError(true);
          return;
        }
        setOp(result);
        if (result.targetUuid) {
          void scriptClient.findInfo(result.targetUuid).then((s) => !cancelled && setScript(s));
        }
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [operationId]);

  const decide = async (approved: boolean, enable?: boolean) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    try {
      await mcpClient.decideOperation({ operationId, approved, enable });
    } catch (e) {
      notify.error((e as Error)?.message || String(e));
    } finally {
      window.close();
    }
  };

  if (loadError || !op) {
    return (
      <PageShell>
        <div data-testid="mcp-confirm-expired" className={cn(cardClass, "items-center text-center")}>
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <CircleAlert className="size-7 text-destructive" />
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("mcp:err_operation_expired")}</p>
          <Button variant="secondary" size="lg" className="w-full font-semibold" onClick={() => window.close()}>
            {t("common:close")}
          </Button>
        </div>
      </PageShell>
    );
  }

  const kind = op.kind as SupportedKind;
  const title =
    kind === "enable"
      ? t("mcp:confirm_enable_title")
      : kind === "disable"
        ? t("mcp:confirm_disable_title")
        : t("mcp:confirm_delete_title");

  return (
    <PageShell>
      <div data-testid="mcp-confirm-card" className={cardClass}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-warning/10">
            <TriangleAlert className="size-7 text-warning" />
          </div>
          <h1 className="text-center text-lg font-semibold text-foreground">{title}</h1>
          {op.requestingClientName && (
            <p className="text-center text-[13px] text-muted-foreground">
              {`${t("mcp:approve_requested_by")}: ${op.requestingClientName}`}
            </p>
          )}
        </div>

        <div className="rounded-xl bg-secondary p-3 text-center">
          <span className="text-sm font-semibold text-foreground">{script?.name ?? op.targetUuid}</span>
        </div>

        {kind === "delete" ? (
          <div className="flex flex-col gap-2.5 pt-1">
            <p className="text-center text-xs text-muted-foreground">{t("mcp:confirm_delete_hold")}</p>
            <HoldToConfirmButton label={t("mcp:confirm_delete_title")} onConfirm={() => void decide(true)} />
            <Button
              variant="ghost"
              size="lg"
              data-testid="mcp-confirm-reject"
              autoFocus
              className="w-full text-muted-foreground"
              onClick={() => void decide(false)}
            >
              {t("mcp:pair_reject")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex gap-3">
              <Button
                size="lg"
                data-testid="mcp-confirm-approve"
                className="flex-1 font-semibold"
                onClick={() => void decide(true, kind === "enable")}
              >
                {t("mcp:enable_confirm")}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                data-testid="mcp-confirm-reject"
                autoFocus
                className="flex-1 border border-border font-semibold"
                onClick={() => void decide(false)}
              >
                {t("mcp:pair_reject")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export function McpPairingView({ pairingId }: { pairingId: string }) {
  const { t } = useTranslation(["mcp", "common"]);
  const [pairing, setPairing] = useState<PendingPairingView>();
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Set<McpScope>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(0);
  const decidedRef = useRef(false);

  // One fetch, not a poll: this popup is the only decision surface for a pairing request (the
  // in-page options-tab dialog doc 05 §5.4 also describes is deliberately not built — see the
  // note in McpController.onPairRequest), so there's nothing external that could change the
  // pending pairing snapshot after this page loads. The local countdown below owns secondsLeft
  // from here on; re-deriving it from a repeated fetch would fight that per-second decrement.
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

  const decide = useCallback(
    (approved: boolean) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      void mcpClient.decidePairing({ pairingId, approved, grantedScopes: approved ? Array.from(selected) : [] });
      window.close();
    },
    [pairingId, selected]
  );

  useEffect(() => {
    if (!pairing || secondsLeft <= 0) return;
    if (secondsLeft <= 1) {
      decide(false);
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

  if (loadError || !pairing) {
    return (
      <PageShell>
        <div data-testid="mcp-pairing-expired" className={cn(cardClass, "items-center text-center")}>
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <CircleAlert className="size-7 text-destructive" />
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("mcp:err_operation_expired")}</p>
          <Button variant="secondary" size="lg" className="w-full font-semibold" onClick={() => window.close()}>
            {t("common:close")}
          </Button>
        </div>
      </PageShell>
    );
  }

  const orderedScopes = SCOPE_ORDER.filter((scope) => pairing.requestedScopes.includes(scope));

  return (
    <PageShell>
      <div data-testid="mcp-pairing-card" className={cardClass}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-warning/10">
            <TriangleAlert className="size-7 text-warning" />
          </div>
          <h1 className="text-center text-lg font-semibold text-foreground">{t("mcp:pair_title")}</h1>
          <span
            data-testid="mcp-pairing-client-name"
            className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground"
          >
            {`"${pairing.clientName}"`}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary p-4">
          <span data-testid="mcp-pairing-code" className="text-2xl font-bold tracking-[0.3em] text-foreground">
            {pairing.code}
          </span>
          <p className="text-center text-xs text-muted-foreground">{t("mcp:pair_verify_code_label")}</p>
        </div>

        <div className="flex flex-col gap-2.5">
          {orderedScopes.map((scope) => (
            <label key={scope} className="flex items-start gap-2.5" htmlFor={`mcp-scope-${scope}`}>
              <Checkbox
                id={`mcp-scope-${scope}`}
                data-testid={`mcp-scope-checkbox-${scope}`}
                checked={selected.has(scope)}
                onCheckedChange={(checked) => toggleScope(scope, checked === true)}
              />
              <span className="flex flex-col">
                <span className="text-sm text-foreground">{t(SCOPE_LABEL_KEY[scope])}</span>
                {scope === "scripts:source:read" && (
                  <span className="text-xs text-muted-foreground">{t("mcp:scope_source_hint")}</span>
                )}
                {WRITE_SCOPES.has(scope) && (
                  <span className="text-xs text-muted-foreground">{t("mcp:scope_write_hint")}</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <p data-testid="mcp-pairing-countdown" className="text-center text-xs text-muted-foreground">
          {t("mcp:pair_expires_in", { time: formatCountdown(secondsLeft) })}
        </p>

        <div className="flex gap-3 pt-1">
          <Button
            size="lg"
            data-testid="mcp-pairing-approve"
            className="flex-1 font-semibold"
            disabled={selected.size === 0}
            onClick={() => decide(true)}
          >
            {t("mcp:pair_approve")}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            data-testid="mcp-pairing-reject"
            autoFocus
            className="flex-1 border border-border font-semibold"
            onClick={() => decide(false)}
          >
            {t("mcp:pair_reject")}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

export default function App() {
  const params = new URLSearchParams(location.search);
  const pairingId = params.get("pairing");
  if (pairingId) return <McpPairingView pairingId={pairingId} />;
  const operationId = params.get("op");
  if (!operationId) return null;
  return <McpConfirmView operationId={operationId} />;
}
