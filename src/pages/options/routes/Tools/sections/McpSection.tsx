import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, ShieldAlert } from "lucide-react";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { Button } from "@App/pages/components/ui/button";
import { Badge } from "@App/pages/components/ui/badge";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@App/pages/components/ui/dialog";
import { systemConfig, message, subscribeMessage } from "@App/pages/store/global";
import { MCPClient } from "@App/app/service/service_worker/client";
import type { McpClient, McpAuditEvent } from "@App/app/repo/mcp";
import type { McpBridgeStatus } from "@App/app/service/service_worker/mcp/types";
import { semTime } from "@App/locales/relative-date";
import { notify } from "@App/pages/components/ui/toast";
import { McpPairingDialog } from "./McpPairingDialog";

let mcpClientInstance: MCPClient | undefined;
function getMcpClient(): MCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient(message);
  }
  return mcpClientInstance;
}

async function fetchMcpState(): Promise<{ status: McpBridgeStatus; clients: McpClient[]; audit: McpAuditEvent[] }> {
  const mcpClient = getMcpClient();
  const [status, clients, audit] = await Promise.all([
    mcpClient.getBridgeStatus().catch(() => "disabled" as McpBridgeStatus),
    mcpClient.getClients().catch(() => []),
    mcpClient.getAudit().catch(() => []),
  ]);
  return { status, clients: clients ?? [], audit: audit ?? [] };
}

function StatusPill({ status, t }: { status: McpBridgeStatus; t: (key: string) => string }) {
  const map: Record<McpBridgeStatus, { label: string; variant: "secondary" | "success" | "warning" | "destructive" }> =
    {
      disabled: { label: t("mcp:status_off"), variant: "secondary" },
      connecting: { label: t("mcp:status_connecting"), variant: "warning" },
      connected: { label: t("mcp:status_connected"), variant: "success" },
      host_unreachable: { label: t("mcp:status_host_unreachable"), variant: "destructive" },
      host_outdated: { label: t("mcp:status_host_outdated"), variant: "destructive" },
    };
  const entry = map[status];
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function McpSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<McpBridgeStatus>("disabled");
  const [writeSession, setWriteSessionState] = useState(false);
  const [clients, setClients] = useState<McpClient[]>([]);
  const [auditEvents, setAuditEvents] = useState<McpAuditEvent[]>([]);
  const [showEnableDialog, setShowEnableDialog] = useState(false);
  const [pendingPairingId, setPendingPairingId] = useState<string>();

  const applyMcpState = (data: { status: McpBridgeStatus; clients: McpClient[]; audit: McpAuditEvent[] }) => {
    setStatus(data.status);
    setClients(data.clients);
    setAuditEvents(data.audit);
  };

  const refresh = () => {
    void fetchMcpState().then(applyMcpState);
  };

  useEffect(() => {
    void Promise.resolve(systemConfig.get("mcp_enabled")).then((v) => setEnabled(Boolean(v)));
    void fetchMcpState().then(applyMcpState);
  }, []);

  // In-page pairing dialog: McpController only skips its own popup when an options tab is
  // already open, so this page is the one responsible for rendering the decision surface in that
  // case — it must listen for the broadcast itself.
  useEffect(() => {
    return subscribeMessage<{ pairingId: string }>("mcpPairingRequested", (data) => {
      setPendingPairingId(data.pairingId);
    });
  }, []);

  const handleEnableToggle = (checked: boolean) => {
    if (!checked) {
      systemConfig.set("mcp_enabled", false);
      setEnabled(false);
      return;
    }
    setShowEnableDialog(true);
  };

  const confirmEnable = () => {
    systemConfig.set("mcp_enabled", true);
    setEnabled(true);
    setShowEnableDialog(false);
  };

  const handleWriteSessionToggle = (checked: boolean) => {
    void getMcpClient().setWriteSession(checked);
    setWriteSessionState(checked);
  };

  const handleRevokeClient = async (clientId: string) => {
    await getMcpClient().revokeClient(clientId);
    notify.success(t("mcp:client_revoke"));
    void refresh();
  };

  const handleRevokeAllAndStop = async () => {
    await getMcpClient().revokeAllAndStop();
    systemConfig.set("mcp_enabled", false);
    setEnabled(false);
    notify.success(t("mcp:revoke_all_stop"));
    void refresh();
  };

  const handleClearAudit = async () => {
    await getMcpClient().clearAudit();
    notify.success(t("mcp:audit_clear"));
    void refresh();
  };

  const handleExportAudit = () => {
    const blob = new Blob([JSON.stringify(auditEvents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scriptcat-mcp-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SettingCard
      id="mcp-bridge"
      title={t("mcp:section_title")}
      titleAction={
        <a
          href="https://docs.scriptcat.org"
          target="_blank"
          rel="noreferrer"
          data-testid="mcp_help"
          aria-label={t("common:user_guide")}
          className="text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-4" />
        </a>
      }
      description={t("mcp:section_desc")}
      register={register}
    >
      <div className="flex items-start gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning-fg">
        <ShieldAlert className="size-4 shrink-0 mt-0.5" />
        <span>{t("mcp:risk_note")}</span>
      </div>

      <SettingRow label={t("mcp:enable_switch")}>
        <StatusPill status={status} t={t} />
        <Switch
          data-testid="mcp_enable_switch"
          aria-label={t("mcp:enable_switch")}
          checked={enabled}
          onCheckedChange={handleEnableToggle}
        />
      </SettingRow>

      {enabled && (
        <>
          {(status === "host_unreachable" || status === "host_outdated") && (
            <SettingRow
              label={status === "host_outdated" ? t("mcp:status_host_outdated") : t("mcp:status_host_unreachable")}
            >
              <Button data-testid="mcp_retry" size="sm" variant="outline" onClick={() => void refresh()}>
                {t("mcp:retry")}
              </Button>
            </SettingRow>
          )}

          <SettingRow label={t("mcp:write_switch")} description={t("mcp:write_switch_hint")}>
            <Switch
              data-testid="mcp_write_switch"
              aria-label={t("mcp:write_switch")}
              checked={writeSession}
              onCheckedChange={handleWriteSessionToggle}
            />
          </SettingRow>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-foreground">{t("mcp:clients_title")}</span>
            {clients.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("mcp:clients_empty")}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="mcp_client_list">
                {clients.map((client) => (
                  <li
                    key={client.clientId}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[13px] font-medium text-foreground truncate">{client.displayName}</span>
                      <div className="flex flex-wrap gap-1">
                        {client.scopes.map((scope) => (
                          <Badge key={scope} variant="outline">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t("mcp:client_last_used", { time: semTime(new Date(client.lastUsedAt)) })}
                      </span>
                    </div>
                    <Popconfirm
                      description={t("mcp:client_revoke_confirm")}
                      destructive
                      onConfirm={() => void handleRevokeClient(client.clientId)}
                    >
                      <Button size="xs" variant="outline" data-testid={`mcp_revoke_${client.clientId}`}>
                        {t("mcp:client_revoke")}
                      </Button>
                    </Popconfirm>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-foreground">{t("mcp:audit_title")}</span>
              <div className="flex gap-2">
                <Button size="xs" variant="outline" data-testid="mcp_audit_export" onClick={handleExportAudit}>
                  {t("mcp:audit_export")}
                </Button>
                <Popconfirm
                  description={t("mcp:audit_clear_confirm")}
                  destructive
                  onConfirm={() => void handleClearAudit()}
                >
                  <Button size="xs" variant="outline" data-testid="mcp_audit_clear">
                    {t("mcp:audit_clear")}
                  </Button>
                </Popconfirm>
              </div>
            </div>
            {auditEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("mcp:audit_empty")}</p>
            ) : (
              <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto" data-testid="mcp_audit_list">
                {auditEvents
                  .slice()
                  .reverse()
                  .map((event) => (
                    <li key={event.eventId} className="text-xs text-muted-foreground flex gap-2">
                      <span className="shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</span>
                      <span className="truncate">{event.clientName}</span>
                      <span className="truncate">{event.action}</span>
                      <span className="shrink-0">{event.decision}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div>
            <Popconfirm
              description={t("mcp:revoke_all_confirm")}
              destructive
              onConfirm={() => void handleRevokeAllAndStop()}
            >
              <Button size="sm" variant="destructive" data-testid="mcp_revoke_all_stop">
                {t("mcp:revoke_all_stop")}
              </Button>
            </Popconfirm>
          </div>
        </>
      )}

      <Dialog open={showEnableDialog} onOpenChange={setShowEnableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mcp:enable_dialog_title")}</DialogTitle>
            <DialogDescription>{t("mcp:enable_dialog_body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              autoFocus
              data-testid="mcp_enable_cancel"
              onClick={() => setShowEnableDialog(false)}
            >
              {t("mcp:cancel")}
            </Button>
            <Button data-testid="mcp_enable_confirm" onClick={confirmEnable}>
              {t("mcp:enable_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingPairingId && (
        <McpPairingDialog
          pairingId={pendingPairingId}
          onClose={() => {
            setPendingPairingId(undefined);
            void refresh();
          }}
        />
      )}
    </SettingCard>
  );
}
