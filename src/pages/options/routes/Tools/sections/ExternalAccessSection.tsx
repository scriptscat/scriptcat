import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { BookOpen, ShieldAlert, ScrollText, Terminal, PlugZap, Check } from "lucide-react";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Badge } from "@App/pages/components/ui/badge";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { SegmentedControl } from "@App/pages/components/ui/segmented-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@App/pages/components/ui/dialog";
import { systemConfig, subscribeMessage } from "@App/pages/store/global";
import { externalAccessClient } from "@App/pages/store/features/script";
import type { ExternalAccessBridgeStatus } from "@App/app/service/service_worker/external_access/types";
import type { ExternalAccessWritePolicy, ExternalAccessSourceReadPolicy } from "@App/pkg/config/config";
import { notify } from "@App/pages/components/ui/toast";

type Gate = "approval" | "allow";

const STATUS_VARIANT: Record<ExternalAccessBridgeStatus, "secondary" | "success" | "warning" | "destructive"> = {
  disabled: "secondary",
  pending_enrollment: "warning",
  connecting: "warning",
  connected: "success",
  host_unreachable: "destructive",
  host_outdated: "destructive",
};

// 深链到日志页并以 component=external-access 预过滤（设计 §4，Logger 路由已支持 ?query=）。
const AUDIT_QUERY = encodeURIComponent(JSON.stringify([{ key: "component", value: "external-access" }]));

// `sctl connect` 打印一次性配对码，只在终端显示、绝不过线；用户读到后填入接入对话框。
const ENROLL_COMMAND = "sctl connect";

function StatusPill({ status, t }: { status: ExternalAccessBridgeStatus; t: (key: string) => string }) {
  const labelKey: Record<ExternalAccessBridgeStatus, string> = {
    disabled: "external_access:status_off",
    pending_enrollment: "external_access:status_pending_enrollment",
    connecting: "external_access:status_connecting",
    connected: "external_access:status_connected",
    host_unreachable: "external_access:status_host_unreachable",
    host_outdated: "external_access:status_host_outdated",
  };
  return (
    <Badge variant={STATUS_VARIANT[status]} data-testid="external_access_status_pill">
      {t(labelKey[status])}
    </Badge>
  );
}

// 一行策略：需人工审批 | 直接允许 分段控件 + 提示；「直接允许」时下方补琥珀警示。
function PolicyRow({
  label,
  hint,
  value,
  onChange,
  testId,
  t,
}: {
  label: string;
  hint: string;
  value: Gate;
  onChange: (v: Gate) => void;
  testId: string;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SettingRow label={label} description={hint}>
        <SegmentedControl<Gate>
          aria-label={label}
          value={value}
          onValueChange={onChange}
          className="w-[220px]"
          options={[
            { value: "approval", label: t("external_access:policy_approval"), testId: `${testId}_approval` },
            { value: "allow", label: t("external_access:policy_allow"), testId: `${testId}_allow` },
          ]}
        />
      </SettingRow>
      {value === "allow" && (
        <div
          data-testid={`${testId}_warning`}
          className="flex items-start gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning-fg"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>{t("external_access:policy_allow_warning")}</span>
        </div>
      )}
    </div>
  );
}

export function ExternalAccessSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<ExternalAccessBridgeStatus>("disabled");
  const [writePolicy, setWritePolicy] = useState<ExternalAccessWritePolicy>("approval");
  const [sourcePolicy, setSourcePolicy] = useState<ExternalAccessSourceReadPolicy>("approval");
  const [mcpUrl, setExternalAccessUrl] = useState("");
  const [showEnroll, setShowEnroll] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    void Promise.resolve(systemConfig.get("external_access_enabled")).then((v) => setEnabled(Boolean(v)));
    void systemConfig.getExternalAccessWritePolicy().then(setWritePolicy);
    void systemConfig.getExternalAccessSourceReadPolicy().then(setSourcePolicy);
    void systemConfig.getExternalAccessUrl().then(setExternalAccessUrl);
    void externalAccessClient
      .getBridgeStatus()
      .then((info) => setStatus(info.status))
      .catch(() => setStatus("disabled"));
  }, []);

  // ExternalAccessController 的状态机在 SW 里推进（接入完成、hello 到达、socket 断开），页面订阅广播以实时更新。
  useEffect(() => {
    return subscribeMessage<{ status: ExternalAccessBridgeStatus }>("mcpStatusChanged", (data) =>
      setStatus(data.status)
    );
  }, []);

  const handleEnableToggle = (checked: boolean) => {
    systemConfig.set("external_access_enabled", checked);
    setEnabled(checked);
  };

  const handleWritePolicy = (v: Gate) => {
    systemConfig.setExternalAccessWritePolicy(v);
    setWritePolicy(v);
  };

  const handleSourcePolicy = (v: Gate) => {
    systemConfig.setExternalAccessSourceReadPolicy(v);
    setSourcePolicy(v);
  };

  const handleSaveUrl = () => {
    const trimmed = mcpUrl.trim();
    if (trimmed) systemConfig.setExternalAccessUrl(trimmed);
  };

  const handleEnroll = async () => {
    const c = code.trim();
    if (!c) return;
    await externalAccessClient.enroll(c);
    setCode("");
    setShowEnroll(false);
    notify.success(t("external_access:enroll_started"));
  };

  const handleStop = async () => {
    await externalAccessClient.stopExternalAccess();
    setEnabled(false);
    notify.success(t("external_access:stop_done"));
  };

  const pending = status === "pending_enrollment";

  const policies = (
    <div className="flex flex-col gap-3.5">
      <span className="text-[13px] font-semibold text-foreground">{t("external_access:policy_title")}</span>
      <PolicyRow
        label={t("external_access:policy_write")}
        hint={t("external_access:policy_write_hint")}
        value={writePolicy}
        onChange={handleWritePolicy}
        testId="external_access_write_policy"
        t={t}
      />
      <PolicyRow
        label={t("external_access:policy_source")}
        hint={t("external_access:policy_source_hint")}
        value={sourcePolicy}
        onChange={handleSourcePolicy}
        testId="external_access_source_policy"
        t={t}
      />
    </div>
  );

  return (
    <SettingCard
      id="external-access"
      title={t("external_access:section_title")}
      titleAction={
        <a
          href="https://docs.scriptcat.org"
          target="_blank"
          rel="noreferrer"
          data-testid="external_access_help"
          aria-label={t("common:user_guide")}
          className="text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="size-4" />
        </a>
      }
      description={t("external_access:section_desc")}
      register={register}
    >
      <SettingRow label={t("external_access:enable_switch")}>
        {/* 已接入态的胶囊放在状态条里；待接入态没有状态条，才在表头显示胶囊，避免重复。 */}
        {enabled && pending && <StatusPill status={status} t={t} />}
        <Switch
          data-testid="external_access_enable_switch"
          aria-label={t("external_access:enable_switch")}
          checked={enabled}
          onCheckedChange={handleEnableToggle}
        />
      </SettingRow>

      {enabled && pending && (
        <>
          <SettingRow label={t("external_access:address_label")}>
            <Input
              data-testid="external_access_url_input"
              aria-label={t("external_access:address_label")}
              value={mcpUrl}
              onChange={(e) => setExternalAccessUrl(e.target.value)}
              onBlur={handleSaveUrl}
              className="w-60 max-w-full font-mono text-xs"
            />
          </SettingRow>

          {policies}

          <div className="flex flex-col gap-3 rounded-md bg-muted p-4">
            <span className="text-[13px] font-semibold text-foreground">{t("external_access:enroll_steps_title")}</span>
            <div className="flex items-center gap-2 text-xs text-foreground">
              <Terminal className="size-4 shrink-0 text-muted-foreground" />
              <span>{t("external_access:enroll_step_run")}</span>
              <code className="rounded bg-card px-1.5 py-0.5 font-mono text-primary">{ENROLL_COMMAND}</code>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button data-testid="external_access_enroll_open" className="gap-1.5" onClick={() => setShowEnroll(true)}>
              <PlugZap className="size-4" />
              {t("external_access:enroll_button")}
            </Button>
            <a
              href="https://docs.scriptcat.org"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] font-medium text-primary hover:underline"
            >
              {t("external_access:enroll_doc")}
            </a>
          </div>
        </>
      )}

      {enabled && !pending && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <StatusPill status={status} t={t} />
              <code className="truncate font-mono text-xs text-muted-foreground">{mcpUrl}</code>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status === "host_unreachable" && (
                <Button
                  data-testid="external_access_retry"
                  size="xs"
                  variant="outline"
                  onClick={() => void externalAccessClient.getBridgeStatus().then((info) => setStatus(info.status))}
                >
                  {t("external_access:retry")}
                </Button>
              )}
              <Button
                data-testid="external_access_reenroll"
                size="xs"
                variant="ghost"
                className="text-primary"
                onClick={() => setShowEnroll(true)}
              >
                {t("external_access:reenroll")}
              </Button>
            </div>
          </div>

          {policies}

          <div className="flex items-center justify-between pt-1">
            <Button
              data-testid="external_access_view_audit"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => navigate(`/logs?query=${AUDIT_QUERY}`)}
            >
              <ScrollText className="size-4" />
              {t("external_access:view_audit")}
            </Button>
            <Popconfirm description={t("external_access:stop_confirm")} destructive onConfirm={() => void handleStop()}>
              <Button size="sm" variant="destructive" data-testid="external_access_stop">
                {t("external_access:stop")}
              </Button>
            </Popconfirm>
          </div>
        </>
      )}

      <Dialog open={showEnroll} onOpenChange={setShowEnroll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("external_access:enroll_dialog_title")}</DialogTitle>
            <DialogDescription>{t("external_access:enroll_dialog_desc")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Terminal className="size-3.5 shrink-0" />
                <span>{t("external_access:enroll_step_run")}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">{ENROLL_COMMAND}</code>
              </div>
              <Input
                data-testid="external_access_enroll_code"
                aria-label={t("external_access:enroll_dialog_title")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("external_access:enroll_code_placeholder")}
                className="text-center font-mono tracking-[0.3em]"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2 rounded-md bg-muted p-3.5 text-xs">
              <span className="font-semibold text-muted-foreground">{t("external_access:enroll_perms_title")}</span>
              {[
                t("external_access:enroll_perm_read"),
                t("external_access:enroll_perm_write"),
                t("external_access:enroll_perm_source"),
              ].map((perm) => (
                <span key={perm} className="flex items-center gap-1.5 text-foreground">
                  <Check className="size-3.5 shrink-0 text-success-fg" />
                  {perm}
                </span>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" data-testid="external_access_enroll_cancel" onClick={() => setShowEnroll(false)}>
              {t("external_access:cancel")}
            </Button>
            <Button
              data-testid="external_access_enroll_submit"
              disabled={!code.trim()}
              onClick={() => void handleEnroll()}
            >
              {t("external_access:enroll_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingCard>
  );
}
