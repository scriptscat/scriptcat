import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@App/pages/components/ui/dialog";
import { Button } from "@App/pages/components/ui/button";
import { usePendingPairing } from "@App/pages/mcp_confirm/usePendingPairing";
import { PairingCode, PairingCountdown, PairingFields } from "@App/pages/mcp_confirm/PairingFields";

/**
 * In-page pairing dialog (doc 05 §5.4 "if the options page is open, show dialog in place"):
 * McpSection renders this whenever it receives an `mcpPairingRequested` broadcast while mounted.
 * Shares the same decision state machine (usePendingPairing) and field components as the
 * standalone mcp_confirm.html?pairing=<id> popup — the only difference is the chrome around it
 * (a Dialog here, a full page there) and that closing this dialog dismisses it in place instead
 * of closing a popup window.
 */
export function McpPairingDialog({ pairingId, onClose }: { pairingId: string; onClose: () => void }) {
  const { t } = useTranslation(["mcp", "common"]);
  const { pairing, loadError, selected, secondsLeft, decide, toggleScope } = usePendingPairing(pairingId, onClose);

  if (loadError) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="mcp-pairing-dialog">
        <DialogHeader>
          <DialogTitle>{t("mcp:pair_title")}</DialogTitle>
        </DialogHeader>

        {!pairing ? null : (
          <>
            <span
              data-testid="mcp-pairing-dialog-client-name"
              className="w-fit rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground"
            >
              {`"${pairing.clientName}"`}
            </span>

            <PairingCode pairing={pairing} />
            <PairingFields pairing={pairing} selected={selected} onToggleScope={toggleScope} />
            <PairingCountdown secondsLeft={secondsLeft} />

            <DialogFooter>
              <Button
                variant="secondary"
                data-testid="mcp-pairing-dialog-reject"
                autoFocus
                onClick={() => void decide(false)}
              >
                {t("mcp:pair_reject")}
              </Button>
              <Button
                data-testid="mcp-pairing-dialog-approve"
                disabled={selected.size === 0}
                onClick={() => void decide(true)}
              >
                {t("mcp:pair_approve")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
