import { useTranslation } from "react-i18next";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import {
  SCOPE_LABEL_KEY,
  SCOPE_ORDER,
  WRITE_SCOPES,
  formatCountdown,
  type McpScope,
  type PendingPairingView,
} from "./usePendingPairing";

/**
 * The scope checklist + verification code + countdown fields shared by the standalone
 * mcp_confirm.html?pairing=<id> popup and the in-page options-tab dialog — everything except the
 * chrome around it (PageShell+card vs Dialog), which differs per surface.
 */
export function PairingFields({
  pairing,
  selected,
  onToggleScope,
}: {
  pairing: NonNullable<PendingPairingView>;
  selected: Set<McpScope>;
  onToggleScope: (scope: McpScope, checked: boolean) => void;
}) {
  const { t } = useTranslation(["mcp", "common"]);
  const orderedScopes = SCOPE_ORDER.filter((scope) => pairing.requestedScopes.includes(scope));

  return (
    <div className="flex flex-col gap-2.5">
      {orderedScopes.map((scope) => (
        <label key={scope} className="flex items-start gap-2.5" htmlFor={`mcp-scope-${scope}`}>
          <Checkbox
            id={`mcp-scope-${scope}`}
            data-testid={`mcp-scope-checkbox-${scope}`}
            checked={selected.has(scope)}
            onCheckedChange={(checked) => onToggleScope(scope, checked === true)}
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
  );
}

export function PairingCode({ pairing }: { pairing: NonNullable<PendingPairingView> }) {
  const { t } = useTranslation(["mcp"]);
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary p-4">
      <span data-testid="mcp-pairing-code" className="text-2xl font-bold tracking-[0.3em] text-foreground">
        {pairing.code}
      </span>
      <p className="text-center text-xs text-muted-foreground">{t("mcp:pair_verify_code_label")}</p>
    </div>
  );
}

export function PairingCountdown({ secondsLeft }: { secondsLeft: number }) {
  const { t } = useTranslation(["mcp"]);
  return (
    <p data-testid="mcp-pairing-countdown" className="text-center text-xs text-muted-foreground">
      {t("mcp:pair_expires_in", { time: formatCountdown(secondsLeft) })}
    </p>
  );
}
