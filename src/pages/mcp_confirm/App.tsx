import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, CircleAlert } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { notify } from "@App/pages/components/ui/toast";
import { mcpClient, scriptClient } from "@App/pages/store/features/script";
import type { Script } from "@App/app/repo/scripts";
import { cn } from "@App/pkg/utils/cn";
import { usePendingPairing } from "./usePendingPairing";
import { PairingCode, PairingCountdown, PairingFields } from "./PairingFields";

type OperationView = Awaited<ReturnType<typeof mcpClient.getOperation>>;

type SupportedKind = "enable" | "disable" | "delete" | "source_disclosure";

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

  const decide = async (approved: boolean, options: { enable?: boolean; rememberChoice?: "once" | "client" } = {}) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    try {
      await mcpClient.decideOperation({ operationId, approved, ...options });
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
        : kind === "source_disclosure"
          ? t("mcp:source_disclosure_title", {
              clientName: op.requestingClientName ?? "",
              scriptName: script?.name ?? op.targetUuid ?? "",
            })
          : t("mcp:confirm_delete_title");

  return (
    <PageShell>
      <div data-testid="mcp-confirm-card" className={cardClass}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-warning/10">
            <TriangleAlert className="size-7 text-warning" />
          </div>
          <h1 className="text-center text-lg font-semibold text-foreground">{title}</h1>
          {kind === "source_disclosure" && (
            <p className="text-center text-[13px] text-muted-foreground">{t("mcp:source_disclosure_body")}</p>
          )}
          {kind !== "source_disclosure" && op.requestingClientName && (
            <p className="text-center text-[13px] text-muted-foreground">
              {`${t("mcp:approve_requested_by")}: ${op.requestingClientName}`}
            </p>
          )}
        </div>

        {kind !== "source_disclosure" && (
          <div className="rounded-xl bg-secondary p-3 text-center">
            <span className="text-sm font-semibold text-foreground">{script?.name ?? op.targetUuid}</span>
          </div>
        )}

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
        ) : kind === "source_disclosure" ? (
          <div className="flex flex-col gap-2.5 pt-1">
            <Button
              size="lg"
              data-testid="mcp-confirm-allow-client"
              className="w-full font-semibold"
              onClick={() => void decide(true, { rememberChoice: "client" })}
            >
              {t("mcp:source_allow_client")}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              data-testid="mcp-confirm-allow-once"
              className="w-full border border-border font-semibold"
              onClick={() => void decide(true, { rememberChoice: "once" })}
            >
              {t("mcp:source_allow_once")}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              data-testid="mcp-confirm-reject"
              autoFocus
              className="w-full text-muted-foreground"
              onClick={() => void decide(false)}
            >
              {t("mcp:source_deny")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex gap-3">
              <Button
                size="lg"
                data-testid="mcp-confirm-approve"
                className="flex-1 font-semibold"
                onClick={() => void decide(true, { enable: kind === "enable" })}
              >
                {kind === "enable" ? t("mcp:confirm_enable_action") : t("mcp:confirm_disable_action")}
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
  const { pairing, loadError, selected, secondsLeft, decide, toggleScope } = usePendingPairing(pairingId, () =>
    window.close()
  );

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

        <PairingCode pairing={pairing} />
        <PairingFields pairing={pairing} selected={selected} onToggleScope={toggleScope} />
        <PairingCountdown secondsLeft={secondsLeft} />

        <div className="flex gap-3 pt-1">
          <Button
            size="lg"
            data-testid="mcp-pairing-approve"
            className="flex-1 font-semibold"
            disabled={selected.size === 0}
            onClick={() => void decide(true)}
          >
            {t("mcp:pair_approve")}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            data-testid="mcp-pairing-reject"
            autoFocus
            className="flex-1 border border-border font-semibold"
            onClick={() => void decide(false)}
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
