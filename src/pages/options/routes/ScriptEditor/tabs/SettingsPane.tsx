import { useEffect, useState } from "react";
import { Copy, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { Script } from "@App/app/repo/scripts";
import type { Permission } from "@App/app/repo/permission";
import { fetchScript, permissionClient, scriptClient } from "@App/pages/store/features/script";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { parseTags } from "@App/app/repo/metadata";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { cn } from "@App/pkg/utils/cn";
import { notify } from "@App/pages/components/ui/toast";
import { Input } from "@App/pages/components/ui/input";
import { Button } from "@App/pages/components/ui/button";
import { DataPanel, DataPanelEmpty, DataPanelHeader, DataPanelRow } from "@App/pages/components/ui/data-panel";
import { Switch } from "@App/pages/components/ui/switch";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { TooltipIconButton } from "@App/pages/components/ui/tooltip-icon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@App/pages/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import { createPreloadableQuery } from "@App/pages/preloadable-query";

const RUN_IN_OPTIONS = ["default", "all", "normal-tabs", "incognito-tabs"];
const RUN_AT_OPTIONS = ["default", "document-start", "document-body", "document-end", "document-idle", "early-start"];
const PERMISSION_TYPES = ["cors", "cookie"];
const PERMISSION_LABEL: Record<string, string> = { cors: "CORS", cookie: "Cookie" };

// 运行环境/运行时机下拉项的本地化文案；运行时机的 document-* / early-start 保持原始字面值（与 v1.4 一致）
const runInLabel = (o: string, t: TFunction) =>
  o === "default" ? t("settings:script_setting.default") : t(`settings:script_run_env.${o}`);
const runAtLabel = (o: string, t: TFunction) => (o === "default" ? t("settings:script_setting.default") : o);

const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const pillColor: Record<string, string> = {
  cors: "bg-primary-light text-primary",
  cookie: "bg-skill-bg text-skill-fg",
  yes: "bg-success-bg text-success-fg",
  no: "bg-destructive/10 text-destructive",
  script: "bg-muted text-muted-foreground",
};
const iconBtn = "rounded p-1 text-muted-foreground hover:bg-accent transition-colors";

type SettingsPaneData = {
  script: Script;
  permissions: Permission[];
};

const settingsPaneQuery = createPreloadableQuery<string, SettingsPaneData | null>({
  key: (uuid) => uuid,
  load: async (uuid, signal) => {
    const script = await fetchScript(uuid);
    if (signal.aborted) throw new DOMException("SettingsPane preload aborted", "AbortError");
    if (!script) return null;

    const permissions = await permissionClient.getScriptPermissions(uuid);
    if (signal.aborted) throw new DOMException("SettingsPane preload aborted", "AbortError");
    return { script, permissions };
  },
});

export function preloadSettingsPane(uuid: string): Promise<SettingsPaneData | null> {
  return settingsPaneQuery.preload(uuid);
}

export function invalidateSettingsPane(uuid?: string) {
  settingsPaneQuery.invalidate(uuid);
}

export function usePreloadSettingsPane(uuid?: string) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!uuid) return;
    void preloadSettingsPane(uuid).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify.error(`${t("script:operation_failed")}: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => invalidateSettingsPane(uuid);
  }, [uuid, t]);
}

// 区块标题（卡片外）
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-semibold text-foreground/70">{children}</h3>;
}

// 卡片容器（圆角描边，内部用分隔线区分行）
function Card({ children }: { children: React.ReactNode }) {
  return <DataPanel>{children}</DataPanel>;
}

// 卡片中的一行：左标签 + 右内容
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DataPanelRow className="border-t-0 border-b px-4 py-3.5 last:border-b-0">
      <span className="shrink-0 text-[13px] text-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </DataPanelRow>
  );
}

export interface SettingsPaneProps {
  uuid: string;
}

export default function SettingsPane({ uuid }: SettingsPaneProps) {
  const settings = settingsPaneQuery.useQuery(uuid);

  useEffect(() => () => invalidateSettingsPane(uuid), [uuid]);

  if (!settings.data) return null;
  return <SettingsPaneContent key={uuid} uuid={uuid} data={settings.data} />;
}

function SettingsPaneContent({ uuid, data }: SettingsPaneProps & { data: SettingsPaneData }) {
  const { t } = useTranslation();
  const [script, setScript] = useState<Script>(data.script);
  const [tags, setTags] = useState<string[]>(() => {
    const meta = data.script.metadata || {};
    const self = data.script.selfMetadata || {};
    return parseTags({ tag: self.tag ?? meta.tag });
  });
  const [tagInput, setTagInput] = useState("");
  const [updateUrl, setUpdateUrl] = useState(data.script.checkUpdateUrl ?? data.script.downloadUrl ?? "");
  const [matches, setMatches] = useState<string[]>(() => {
    const meta = data.script.metadata || {};
    const self = data.script.selfMetadata || {};
    return self.match ?? meta.match ?? [];
  });
  const [excludes, setExcludes] = useState<string[]>(() => {
    const meta = data.script.metadata || {};
    const self = data.script.selfMetadata || {};
    return self.exclude ?? meta.exclude ?? [];
  });
  const [permissions, setPermissions] = useState<Permission[]>(data.permissions);
  const [addMatchKind, setAddMatchKind] = useState<"match" | "exclude" | null>(null);
  const [addMatchValue, setAddMatchValue] = useState("");
  const [permOpen, setPermOpen] = useState(false);
  const [permDraft, setPermDraft] = useState<{ permission: string; permissionValue: string; allow: boolean }>({
    permission: "cors",
    permissionValue: "",
    allow: true,
  });

  const meta = script.metadata || {};
  const self = script.selfMetadata || {};
  const metaMatch = meta.match ?? [];
  const metaExclude = meta.exclude ?? [];

  const runIn = self["run-in"]?.[0] ?? meta["run-in"]?.[0] ?? "default";
  const runAt = self["early-start"] ? "early-start" : (self["run-at"]?.[0] ?? meta["run-at"]?.[0] ?? "default");
  const checkUpdate = script.checkUpdate !== false;

  const patchSelf = (patch: Record<string, string[]>) =>
    setScript((prev) => (prev ? { ...prev, selfMetadata: { ...prev.selfMetadata, ...patch } } : prev));

  const onRunIn = (value: string) => {
    const v = value === "default" ? [] : [value];
    void scriptClient.updateMetadata(uuid, "run-in", v);
    patchSelf({ "run-in": v });
  };

  const onRunAt = (value: string) => {
    if (value === "early-start") {
      void scriptClient.updateMetadata(uuid, "early-start", [""]);
      void scriptClient.updateMetadata(uuid, "run-at", ["document-start"]);
      patchSelf({ "early-start": [""], "run-at": ["document-start"] });
    } else {
      const v = value === "default" ? [] : [value];
      void scriptClient.updateMetadata(uuid, "early-start", []);
      void scriptClient.updateMetadata(uuid, "run-at", v);
      patchSelf({ "early-start": [], "run-at": v });
    }
  };

  // ===== 标签 =====
  const commitTags = (next: string[]) => {
    setTags(next);
    void scriptClient.updateMetadata(uuid, "tag", next);
  };
  const addTag = () => {
    const v = tagInput.trim();
    setTagInput("");
    if (!v || tags.includes(v)) return;
    commitTags([...tags, v]);
  };

  // ===== 更新 =====
  const onCheckUpdate = (checked: boolean) => {
    void scriptClient.setCheckUpdateUrl(uuid, checked, updateUrl);
    setScript((prev) => (prev ? { ...prev, checkUpdate: checked } : prev));
  };
  const saveUpdateUrl = () => scriptClient.setCheckUpdateUrl(uuid, checkUpdate, updateUrl);

  // ===== 匹配 / 排除 =====
  const setMatchList = (kind: "match" | "exclude", next: string[] | undefined) => {
    if (kind === "match") {
      void scriptClient.resetMatch(uuid, next);
      setMatches(next ?? []);
    } else {
      void scriptClient.resetExclude(uuid, next);
      setExcludes(next ?? []);
    }
    patchSelf({ [kind]: next ?? [] });
  };
  const submitAddMatch = () => {
    const v = addMatchValue.trim();
    if (!v) return;
    const kind = addMatchKind!;
    const list = kind === "match" ? matches : excludes;
    setMatchList(kind, [...list, v]);
    setAddMatchKind(null);
    setAddMatchValue("");
  };

  // ===== 授权管理 =====
  const samePermission = (a: Permission, b: { permission: string; permissionValue: string }) =>
    a.permission === b.permission && a.permissionValue === b.permissionValue;
  const toggleAllow = (p: Permission) => {
    const updated = { ...p, allow: !p.allow };
    void permissionClient.updatePermission(updated).then(() => {
      setPermissions((prev) => prev.map((x) => (samePermission(x, p) ? updated : x)));
    });
  };
  const removePermission = (p: Permission) => {
    void permissionClient.deletePermission(uuid, p.permission, p.permissionValue).then(() => {
      setPermissions((prev) => prev.filter((x) => !samePermission(x, p)));
      notify.success(t("delete_success"));
    });
  };
  const resetPermissions = () => {
    void permissionClient.resetPermission(uuid).then(() => {
      setPermissions([]);
      notify.success(t("update_success"));
    });
  };
  const openAddPermission = () => {
    setPermDraft({ permission: "cors", permissionValue: "", allow: true });
    setPermOpen(true);
  };
  const submitAddPermission = () => {
    const perm: Permission = {
      uuid,
      permission: permDraft.permission,
      permissionValue: permDraft.permissionValue.trim(),
      allow: permDraft.allow,
      createtime: Date.now(),
      updatetime: 0,
    };
    void permissionClient.addPermission(perm).then(() => {
      setPermissions((prev) => [...prev.filter((x) => !samePermission(x, perm)), perm]);
      setPermOpen(false);
      notify.success(t("update_success"));
    });
  };

  const matchTable = (kind: "match" | "exclude") => {
    const list = kind === "match" ? matches : excludes;
    const metaList = kind === "match" ? metaMatch : metaExclude;
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center">
          <SectionTitle>{t(kind === "match" ? "editor:website_match" : "editor:website_exclude")}</SectionTitle>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAddMatchValue("");
                setAddMatchKind(kind);
              }}
            >
              <Plus className="size-3.5" />
              {t(kind === "match" ? "editor:add_match" : "editor:add_exclude")}
            </Button>
            <Popconfirm
              description={t("editor:confirm_reset")}
              destructive
              confirmText={t("confirm")}
              cancelText={t("editor:cancel")}
              onConfirm={() => setMatchList(kind, undefined)}
            >
              <Button
                size="sm"
                variant="ghost"
                className="text-warning hover:bg-warning/10 hover:text-warning"
                disabled={list.length === 0}
              >
                <RotateCcw className="size-3.5" />
                {t("reset")}
              </Button>
            </Popconfirm>
          </div>
        </div>

        <Card>
          <DataPanelHeader>
            <span className="min-w-0 flex-1">{t("editor:match")}</span>
            <span className="w-24 shrink-0">{t("editor:source")}</span>
            <span className="w-16 shrink-0 text-right">{t("action")}</span>
          </DataPanelHeader>
          {list.length === 0 ? (
            <DataPanelEmpty>{t("no_data")}</DataPanelEmpty>
          ) : (
            list.map((m, i) => {
              const byUser = !metaList.includes(m);
              return (
                <DataPanelRow key={`${m}-${i}`}>
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={m}>
                    {m}
                  </span>
                  <span className="w-24 shrink-0">
                    <span className={cn(pill, byUser ? pillColor.yes : pillColor.script)}>
                      {t(byUser ? "editor:from_user" : "editor:from_script")}
                    </span>
                  </span>
                  <div className="flex w-16 shrink-0 justify-end">
                    <Popconfirm
                      description={t("editor:confirm_reset")}
                      destructive
                      confirmText={t("confirm")}
                      cancelText={t("editor:cancel")}
                      onConfirm={() =>
                        setMatchList(
                          kind,
                          list.filter((x) => x !== m)
                        )
                      }
                    >
                      <button
                        type="button"
                        aria-label={`${t("delete")} ${m}`}
                        className={cn(iconBtn, "hover:text-destructive")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </Popconfirm>
                  </div>
                </DataPanelRow>
              );
            })
          )}
        </Card>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-custom px-8 py-6">
      <div className="flex flex-col gap-7">
        {/* 基本信息 */}
        <div className="flex flex-col gap-2.5">
          <SectionTitle>{t("editor:basic_info")}</SectionTitle>
          <Card>
            <Row label={t("editor:last_updated")}>
              <span className="truncate text-[13px] text-foreground/70">
                {formatUnixTime((script.updatetime || script.createtime || 0) / 1000)}
              </span>
            </Row>
            <Row label="UUID">
              <span className="truncate font-mono text-xs text-foreground/70" title={script.uuid}>
                {script.uuid}
              </span>
              <TooltipIconButton
                label={t("copy")}
                icon={Copy}
                size="icon-xs"
                onClick={() => navigator.clipboard?.writeText(script.uuid)}
              />
            </Row>
            <Row label={t("script:tags")}>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className={cn(pill, "gap-1 bg-primary/10 text-primary")}>
                    {tag}
                    <button
                      type="button"
                      aria-label={`${t("delete")} ${tag}`}
                      onClick={() => commitTags(tags.filter((x) => x !== tag))}
                      className="hover:opacity-70"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder={t("script:input_tags_placeholder")}
                  className="h-7 w-40 text-xs"
                />
              </div>
            </Row>
          </Card>
        </div>

        {/* 运行设置 */}
        <div className="flex flex-col gap-2.5">
          <SectionTitle>{t("editor:run_settings")}</SectionTitle>
          <Card>
            <Row label={t("editor:run_in")}>
              <Select value={runIn} onValueChange={onRunIn}>
                <SelectTrigger className="h-8 w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUN_IN_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {runInLabel(o, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label={t("editor:run_at")}>
              <Select value={runAt} onValueChange={onRunAt}>
                <SelectTrigger className="h-8 w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUN_AT_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {runAtLabel(o, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          </Card>
        </div>

        {/* 更新 */}
        <div className="flex flex-col gap-2.5">
          <SectionTitle>{t("update")}</SectionTitle>
          <Card>
            <Row label={t("check_update")}>
              <Switch aria-label={t("check_update")} checked={checkUpdate} onCheckedChange={onCheckUpdate} />
            </Row>
            <Row label={t("editor:update_url")}>
              <Input
                value={updateUrl}
                onChange={(e) => setUpdateUrl(e.target.value)}
                onBlur={saveUpdateUrl}
                placeholder="https://example.com/script.meta.js"
                className="h-8 flex-1 font-mono text-xs"
              />
            </Row>
          </Card>
        </div>

        {/* 网站匹配 / 网站排除 */}
        {matchTable("match")}
        {matchTable("exclude")}

        {/* 授权管理 */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center">
            <SectionTitle>{t("permission:permission_management")}</SectionTitle>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openAddPermission}>
                <Plus className="size-3.5" />
                {t("editor:add_permission")}
              </Button>
              <Popconfirm
                description={t("editor:confirm_reset")}
                destructive
                confirmText={t("confirm")}
                cancelText={t("editor:cancel")}
                onConfirm={resetPermissions}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-warning hover:bg-warning/10 hover:text-warning"
                  disabled={permissions.length === 0}
                >
                  <RotateCcw className="size-3.5" />
                  {t("reset")}
                </Button>
              </Popconfirm>
            </div>
          </div>

          <Card>
            <DataPanelHeader>
              <span className="w-28 shrink-0">{t("type")}</span>
              <span className="min-w-0 flex-1">{t("permission:permission_value")}</span>
              <span className="w-24 shrink-0 text-center">{t("permission:allow")}</span>
              <span className="w-16 shrink-0 text-right">{t("action")}</span>
            </DataPanelHeader>
            {permissions.length === 0 ? (
              <DataPanelEmpty>{t("no_data")}</DataPanelEmpty>
            ) : (
              permissions.map((p) => (
                <DataPanelRow key={`${p.permission}:${p.permissionValue}`}>
                  <span className="w-28 shrink-0">
                    <span className={cn(pill, pillColor[p.permission] ?? pillColor.script)}>
                      {PERMISSION_LABEL[p.permission] ?? p.permission}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={p.permissionValue}>
                    {p.permissionValue || "-"}
                  </span>
                  <div className="flex w-24 shrink-0 justify-center">
                    <button
                      type="button"
                      aria-label={`${t("permission:allow")} ${p.permissionValue}`}
                      onClick={() => toggleAllow(p)}
                      className={cn(pill, p.allow ? pillColor.yes : pillColor.no)}
                    >
                      {p.allow ? t("yes") : t("no")}
                    </button>
                  </div>
                  <div className="flex w-16 shrink-0 justify-end">
                    <Popconfirm
                      description={t("confirm_delete_permission")}
                      destructive
                      confirmText={t("confirm")}
                      cancelText={t("editor:cancel")}
                      onConfirm={() => removePermission(p)}
                    >
                      <button
                        type="button"
                        aria-label={`${t("delete")} ${p.permissionValue}`}
                        className={cn(iconBtn, "hover:text-destructive")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </Popconfirm>
                  </div>
                </DataPanelRow>
              ))
            )}
          </Card>
        </div>
      </div>

      {/* 添加匹配 / 排除 弹窗 */}
      <Dialog open={!!addMatchKind} onOpenChange={(open) => !open && setAddMatchKind(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(addMatchKind === "exclude" ? "editor:add_exclude" : "editor:add_match")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t(addMatchKind === "exclude" ? "editor:add_exclude" : "editor:add_match")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={addMatchValue}
            onChange={(e) => setAddMatchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAddMatch()}
            placeholder="*://*.example.com/*"
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMatchKind(null)}>
              {t("editor:cancel")}
            </Button>
            <Button onClick={submitAddMatch}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加授权 弹窗 */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editor:add_permission")}</DialogTitle>
            <DialogDescription className="sr-only">{t("editor:add_permission")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select value={permDraft.permission} onValueChange={(v) => setPermDraft({ ...permDraft, permission: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {t(`permission:permission_${tp}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={permDraft.permissionValue}
              onChange={(e) => setPermDraft({ ...permDraft, permissionValue: e.target.value })}
              placeholder={t("permission:permission_value")}
            />
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox
                checked={permDraft.allow}
                onCheckedChange={(c) => setPermDraft({ ...permDraft, allow: c === true })}
              />
              {t("permission:allow")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermOpen(false)}>
              {t("editor:cancel")}
            </Button>
            <Button onClick={submitAddPermission}>{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
