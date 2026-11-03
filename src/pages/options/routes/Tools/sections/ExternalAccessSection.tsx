import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  ShieldAlert,
  ScrollText,
  Terminal,
  PlugZap,
  Check,
  Download,
  Eye,
  Loader2,
  Pencil,
  Power,
} from "lucide-react";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Badge } from "@App/pages/components/ui/badge";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { SegmentedControl } from "@App/pages/components/ui/segmented-control";
import { PairingCodeInput } from "@App/pages/components/ui/pairing-code-input";
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
import type {
  ExternalAccessBridgeStatus,
  ExternalAccessBridgeStatusInfo,
} from "@App/app/service/service_worker/external_access/types";
import {
  isValidExternalAccessName,
  type ExternalAccessWritePolicy,
  type ExternalAccessSourceReadPolicy,
} from "@App/pkg/config/config";
import { notify } from "@App/pages/components/ui/toast";
import { DocumentationSite } from "@App/app/const";
import { localePath } from "@App/locales/locales";

type Gate = "approval" | "allow";

const STATUS_VARIANT: Record<ExternalAccessBridgeStatus, "secondary" | "success" | "warning" | "destructive"> = {
  disabled: "secondary",
  pending_enrollment: "warning",
  connecting: "warning",
  connected: "success",
  host_unreachable: "destructive",
  rejected: "destructive",
};

// 深链到日志页并以 component=external-access 预过滤（设计 §4，Logger 路由已支持 ?query=）。
const AUDIT_QUERY = encodeURIComponent(JSON.stringify([{ key: "component", value: "external-access" }]));

// `sctl connect` 打印一次性配对码，只在终端显示、绝不过线；用户读到后填入接入对话框。
const ENROLL_COMMAND = "sctl connect";

// 文档站只有中文与英文两版，localePath 按界面语言在两者间切换（同 agentDocUrl）。
const docUrl = () => `${DocumentationSite}${localePath}/docs/use/external-access/`;

function StatusPill({ status, t }: { status: ExternalAccessBridgeStatus; t: (key: string) => string }) {
  const labelKey: Record<ExternalAccessBridgeStatus, string> = {
    disabled: "external_access:status_off",
    pending_enrollment: "external_access:status_pending_enrollment",
    connecting: "external_access:status_connecting",
    connected: "external_access:status_connected",
    host_unreachable: "external_access:status_host_unreachable",
    rejected: "external_access:status_rejected",
  };
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      className="shrink-0 whitespace-nowrap"
      data-testid="external_access_status_pill"
    >
      {t(labelKey[status])}
    </Badge>
  );
}

// 接入步骤的编号圆点（primary-light 底 + primary 数字，设计稿 Steps num）。
function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
      {n}
    </span>
  );
}

// 一行策略：前导图标 + 需人工审批 | 直接允许 分段控件 + 提示；「直接允许」时下方补琥珀警示。
function PolicyRow({
  label,
  hint,
  icon,
  value,
  onChange,
  testId,
  t,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  value: Gate;
  onChange: (v: Gate) => void;
  testId: string;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SettingRow label={label} description={hint} icon={icon}>
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
  const [statusInfo, setStatusInfo] = useState<ExternalAccessBridgeStatusInfo>();
  const { status = "disabled", daemonVersion } = statusInfo ?? {};
  const [writePolicy, setWritePolicy] = useState<ExternalAccessWritePolicy>("approval");
  const [sourcePolicy, setSourcePolicy] = useState<ExternalAccessSourceReadPolicy>("approval");
  const [mcpUrl, setExternalAccessUrl] = useState("");
  const [showEnroll, setShowEnroll] = useState(false);
  const [code, setCode] = useState("");
  const [enrollName, setEnrollName] = useState("");
  const [enrollNameError, setEnrollNameError] = useState<string>();
  const [enrolling, setEnrolling] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    void Promise.resolve(systemConfig.get("external_access_enabled")).then((v) => setEnabled(Boolean(v)));
    void systemConfig.getExternalAccessWritePolicy().then(setWritePolicy);
    void systemConfig.getExternalAccessSourceReadPolicy().then(setSourcePolicy);
    void systemConfig.getExternalAccessUrl().then(setExternalAccessUrl);
    void externalAccessClient
      .getBridgeStatus()
      .then(setStatusInfo)
      .catch(() => setStatusInfo(undefined));
  }, []);

  // ExternalAccessController 的状态机在 SW 里推进（接入完成、hello 到达、socket 断开），页面订阅广播以实时更新。
  useEffect(() => {
    return subscribeMessage<ExternalAccessBridgeStatusInfo>("mcpStatusChanged", setStatusInfo);
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

  const nameInvalid = !isValidExternalAccessName(nameDraft);
  const enrollNameInvalid = !isValidExternalAccessName(enrollName);

  // 对话框可能从待接入态或拒绝态的「重新接入」打开；两处都用当前名称预填并清掉上一轮的码与提示。
  const openEnroll = () => {
    setCode("");
    setEnrollName(statusInfo?.name ?? "");
    setEnrollNameError(undefined);
    setShowEnroll(true);
  };

  const startNameEdit = () => {
    setNameDraft(statusInfo?.name ?? "");
    setNameError(undefined);
    setNameEditing(true);
  };

  const cancelNameEdit = () => {
    setNameDraft(statusInfo?.name ?? "");
    setNameError(undefined);
    setNameEditing(false);
  };

  const handleEnroll = async () => {
    const c = code.trim();
    if (!c || !statusInfo || enrollNameInvalid || enrolling) return;
    setEnrolling(true);
    setEnrollNameError(undefined);
    try {
      const result = await externalAccessClient.enroll(c, enrollName);
      if (result === "name-taken") {
        // sctl 在认证通过即消费配对码；冲突后旧码不可再用，必须改名并重新运行 sctl connect。
        setCode("");
        setEnrollNameError(t("external_access:enroll_name_taken"));
        return;
      }
      if (result === "invalid-name") {
        setEnrollNameError(t("external_access:name_invalid_hint"));
        return;
      }
      setCode("");
      setShowEnroll(false);
      // 名称问题之外的结果沿用原有的进行中提示：sctl 未运行时 offscreen 仍在重连，最终成败以状态胶囊为准。
      notify.info(t("external_access:enroll_started"));
    } catch {
      notify.error(t("external_access:enroll_failed"));
    } finally {
      setEnrolling(false);
    }
  };

  const handleRename = async () => {
    if (nameInvalid || savingName) return;
    setSavingName(true);
    setNameError(undefined);
    try {
      const result = await externalAccessClient.rename(nameDraft);
      if (result === "ok" || result === "applies-next-connection") {
        setStatusInfo((info) => (info ? { ...info, name: nameDraft } : info));
        setNameEditing(false);
        if (result === "ok") notify.success(t("external_access:rename_success"));
        else notify.info(t("external_access:rename_next_connection"));
        return;
      }
      if (result === "name-taken") {
        setNameError(t("external_access:name_taken"));
        return;
      }
      if (result === "invalid-name") {
        setNameError(t("external_access:name_invalid_hint"));
        return;
      }
      setNameError(t("external_access:rename_not_connected"));
    } catch {
      setNameError(t("external_access:rename_failed"));
    } finally {
      setSavingName(false);
    }
  };

  const handleStop = async () => {
    await externalAccessClient.stopExternalAccess();
    setEnabled(false);
    notify.success(t("external_access:stop_done"));
  };

  const pending = status === "pending_enrollment";

  // 权限策略两行：写操作 / 源码读取，各带前导图标 + 分段控件。headHint 仅待接入态给出「接入前可预设」。
  const renderPolicies = (headHint?: string) => (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">{t("external_access:policy_title")}</span>
        {headHint && <span className="text-xs text-muted-foreground">{headHint}</span>}
      </div>
      <PolicyRow
        label={t("external_access:policy_write")}
        hint={t("external_access:policy_write_hint")}
        icon={<Download className="size-[17px]" />}
        value={writePolicy}
        onChange={handleWritePolicy}
        testId="external_access_write_policy"
        t={t}
      />
      <PolicyRow
        label={t("external_access:policy_source")}
        hint={t("external_access:policy_source_hint")}
        icon={<Eye className="size-[17px]" />}
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
      icon={PlugZap}
      title={t("external_access:section_title")}
      titleAction={
        <a
          href={docUrl()}
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
      action={
        <Switch
          data-testid="external_access_enable_switch"
          aria-label={t("external_access:enable_switch")}
          checked={enabled}
          onCheckedChange={handleEnableToggle}
        />
      }
      register={register}
    >
      {enabled && pending && (
        <>
          {/* 地址：标签在上 + 整行 mono 输入（接入前可编辑，设计稿 k7k3h） */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-foreground">{t("external_access:address_label")}</span>
            <Input
              data-testid="external_access_url_input"
              aria-label={t("external_access:address_label")}
              value={mcpUrl}
              onChange={(e) => setExternalAccessUrl(e.target.value)}
              onBlur={handleSaveUrl}
              className="w-full font-mono text-xs"
            />
          </div>

          {renderPolicies(t("external_access:policy_preset_hint"))}

          {/* 待接入状态行：琥珀胶囊 + 中性提示（措辞不虚报「已检测到 sctl」） */}
          <div className="flex items-center gap-2.5">
            <StatusPill status={status} t={t} />
            <span className="text-xs text-muted-foreground">{t("external_access:status_pending_hint")}</span>
          </div>

          {/* 一次性接入：两步带编号（设计稿 Steps） */}
          <div className="flex flex-col gap-3 rounded-md bg-muted p-4">
            <span className="text-[13px] font-semibold text-foreground">{t("external_access:enroll_steps_title")}</span>
            <div className="flex items-center gap-2.5 text-xs text-foreground">
              <StepNumber n={1} />
              <span className="flex flex-wrap items-center gap-1.5">
                {t("external_access:enroll_step_run")}
                <code className="rounded bg-card px-1.5 py-0.5 font-mono text-primary">{ENROLL_COMMAND}</code>
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-foreground">
              <StepNumber n={2} />
              <span>{t("external_access:enroll_step_open")}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button data-testid="external_access_enroll_open" className="gap-1.5" onClick={openEnroll}>
              <PlugZap className="size-4" />
              {t("external_access:enroll_button")}
            </Button>
            <a
              href={docUrl()}
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
              {daemonVersion && (
                <>
                  <span aria-hidden className="size-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span data-testid="external_access_daemon_version" className="shrink-0 text-xs text-muted-foreground">
                    {`sctl v${daemonVersion}`}
                  </span>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status === "host_unreachable" && (
                <Button
                  data-testid="external_access_retry"
                  size="xs"
                  variant="outline"
                  onClick={() => void externalAccessClient.getBridgeStatus().then(setStatusInfo)}
                >
                  {t("external_access:retry")}
                </Button>
              )}
              {status !== "rejected" && (
                <Button
                  data-testid="external_access_reenroll"
                  size="xs"
                  variant="ghost"
                  className="text-primary"
                  onClick={openEnroll}
                >
                  {t("external_access:reenroll")}
                </Button>
              )}
            </div>
          </div>

          {status === "rejected" && (
            <div
              data-testid="external_access_rejected_notice"
              className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p data-testid="external_access_rejected_reason" className="text-xs text-foreground">
                  {statusInfo?.reason === "name-taken"
                    ? t("external_access:rejected_name_taken_reason")
                    : t("external_access:rejected_refused_reason")}
                </p>
              </div>
              {statusInfo?.reason === "name-taken" ? (
                <Button
                  data-testid="external_access_edit_name"
                  size="xs"
                  variant="outline"
                  className="self-start md:self-auto"
                  onClick={startNameEdit}
                >
                  {t("external_access:name_edit_action")}
                </Button>
              ) : (
                <Button
                  data-testid="external_access_reenroll"
                  size="xs"
                  variant="outline"
                  className="self-start md:self-auto"
                  onClick={openEnroll}
                >
                  {t("external_access:reenroll")}
                </Button>
              )}
            </div>
          )}

          {nameEditing ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-foreground">
                {t("external_access:instance_name_label")}
              </span>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Input
                  data-testid="external_access_name_input"
                  aria-label={t("external_access:instance_name_label")}
                  aria-invalid={nameInvalid || Boolean(nameError)}
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setNameError(undefined);
                  }}
                  disabled={savingName}
                  autoFocus
                  className="w-full font-mono text-xs md:max-w-xs"
                />
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="external_access_name_save"
                    size="sm"
                    disabled={nameInvalid || savingName}
                    onClick={() => void handleRename()}
                  >
                    {savingName && <Loader2 className="size-4 animate-spin" />}
                    {savingName ? t("external_access:rename_saving") : t("external_access:name_save")}
                  </Button>
                  <Button
                    data-testid="external_access_name_cancel"
                    size="sm"
                    variant="outline"
                    disabled={savingName}
                    onClick={cancelNameEdit}
                  >
                    {t("external_access:cancel")}
                  </Button>
                </div>
              </div>
              {(nameInvalid || nameError) && (
                <p data-testid="external_access_name_error" role="alert" className="text-xs text-destructive">
                  {nameError ?? t("external_access:name_invalid_hint")}
                </p>
              )}
            </div>
          ) : (
            <div
              data-testid="external_access_name_row"
              className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">
                  {t("external_access:instance_name_label")}
                </span>
                <code
                  data-testid="external_access_name_value"
                  className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                >
                  {statusInfo?.name ?? "—"}
                </code>
              </div>
              <Button
                data-testid="external_access_name_edit"
                size="xs"
                variant="ghost"
                className="self-start text-primary md:self-auto"
                onClick={startNameEdit}
              >
                <Pencil className="size-3.5" />
                {t("external_access:name_edit")}
              </Button>
            </div>
          )}

          {renderPolicies()}

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
              {/* 危险动作用幽灵样式 + power 图标 + 红字（设计稿 DE9Pe），而非填充按钮 */}
              <Button
                size="sm"
                variant="ghost"
                data-testid="external_access_stop"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Power className="size-4" />
                {t("external_access:stop")}
              </Button>
            </Popconfirm>
          </div>
        </>
      )}

      <Dialog open={showEnroll} onOpenChange={setShowEnroll}>
        <DialogContent>
          <DialogHeader>
            {/* 图标框 + 标题 + 副标题（设计稿 ZNgIM） */}
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                <PlugZap className="size-5 text-primary" />
              </div>
              <div className="flex flex-col gap-0.5 text-left">
                <DialogTitle>{t("external_access:enroll_dialog_title")}</DialogTitle>
                <DialogDescription>{t("external_access:enroll_dialog_desc")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Terminal className="size-3.5 shrink-0" />
                <span>{t("external_access:enroll_step_run")}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">{ENROLL_COMMAND}</code>
              </div>
              <PairingCodeInput
                data-testid="external_access_enroll_code"
                aria-label={t("external_access:enroll_dialog_title")}
                value={code}
                onChange={setCode}
                disabled={enrolling}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-foreground">{t("external_access:instance_name_label")}</span>
              <Input
                data-testid="external_access_enroll_name_input"
                aria-label={t("external_access:instance_name_label")}
                aria-invalid={enrollNameInvalid || Boolean(enrollNameError)}
                value={enrollName}
                onChange={(e) => {
                  setEnrollName(e.target.value);
                  setEnrollNameError(undefined);
                }}
                disabled={enrolling}
                className="font-mono text-xs"
              />
              {(enrollNameInvalid || enrollNameError) && (
                <p data-testid="external_access_enroll_name_error" role="alert" className="text-xs text-destructive">
                  {enrollNameError ?? t("external_access:name_invalid_hint")}
                </p>
              )}
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
            <Button
              variant="outline"
              data-testid="external_access_enroll_cancel"
              disabled={enrolling}
              onClick={() => setShowEnroll(false)}
            >
              {t("external_access:cancel")}
            </Button>
            <Button
              data-testid="external_access_enroll_submit"
              disabled={code.length < 8 || enrollNameInvalid || enrolling}
              onClick={() => void handleEnroll()}
            >
              {enrolling && <Loader2 className="size-4 animate-spin" />}
              {enrolling ? t("external_access:enroll_submitting") : t("external_access:enroll_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingCard>
  );
}
