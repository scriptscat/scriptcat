import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles, Upload, Link2, Plus, RefreshCw } from "lucide-react";
import type { SkillSummary } from "@App/app/service/agent/core/types";
import { DocumentationSite } from "@App/app/const";
import { localePath } from "@App/locales/locales";
import { agentClient } from "@App/pages/store/features/script";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@App/pages/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@App/pages/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@App/pages/components/ui/alert-dialog";
import { useSkills } from "../AgentChat/hooks";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { AgentEmptyState } from "../_agent/AgentEmptyState";
import { CountBar, type CountBarSegment } from "../_agent/CountBar";
import { SkillCard } from "./SkillCard";
import { SkillDetailDialog } from "./SkillDetailDialog";
import { SkillConfigDialog } from "./SkillConfigDialog";
import { installSkillFromZip, installSkillFromUrl } from "./skill_install";
import type { SkillDetail } from "./skill_detail";
import { invalidateSkillConfig, invalidateSkillDetail, preloadSkillConfig, preloadSkillDetail } from "./preload";

const DOC_URL = `${DocumentationSite}${localePath}/docs/dev/agent/agent-skill-install`;

export default function AgentSkills() {
  const { t } = useTranslation(["agent", "common"]);
  const { skills, loadSkills } = useSkills();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateMap, setUpdateMap] = useState<Record<string, string>>({}); // name → 远程新版本号

  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [uninstallTarget, setUninstallTarget] = useState<SkillSummary | null>(null);

  useEffect(() => {
    const record = detail?.record;
    if (!record?.config || Object.keys(record.config).length === 0) return;
    void preloadSkillConfig(record).catch(() => undefined);
  }, [detail]);

  useEffect(
    () => () => {
      invalidateSkillDetail();
      invalidateSkillConfig();
    },
    []
  );

  const updateCount = skills.filter((s) => updateMap[s.name]).length;

  const handleZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    try {
      await installSkillFromZip(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUrl = async () => {
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    try {
      await installSkillFromUrl(value);
      setUrlOpen(false);
      setUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      const updates = await agentClient.checkForUpdates();
      const map: Record<string, string> = {};
      for (const u of updates) map[u.name] = u.remoteVersion;
      setUpdateMap(map);
      if (updates.length === 0) {
        toast.success(t("agent:skills_no_updates"));
      } else {
        toast.info(`${updates.length} ${t("agent:skills_updates_available")}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const handleToggleEnabled = async (name: string, enabled: boolean) => {
    try {
      invalidateSkillDetail(name);
      await agentClient.setSkillEnabled(name, enabled);
      await loadSkills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdate = async (name: string) => {
    try {
      invalidateSkillDetail(name);
      invalidateSkillConfig();
      await agentClient.updateSkill(name);
      toast.success(t("agent:skills_update_success"));
      setUpdateMap((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      await loadSkills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRefresh = async (name: string) => {
    try {
      invalidateSkillDetail(name);
      invalidateSkillConfig();
      await agentClient.refreshSkill(name);
      await loadSkills();
      toast.success(t("agent:skills_refresh_success"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDetail = async (name: string) => {
    try {
      const loaded = await preloadSkillDetail(name);
      if (!loaded) return;
      setDetail(loaded);
      setDetailOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return;
    const name = uninstallTarget.name;
    setUninstallTarget(null);
    try {
      invalidateSkillDetail(name);
      invalidateSkillConfig();
      await agentClient.removeSkill(name);
      await loadSkills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // 添加菜单(上传 ZIP / 从 URL 导入)。移动端为图标按钮,桌面端为带文字主按钮。
  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isMobile ? (
          <Button size="icon" data-testid="skill-add" aria-label={t("agent:skills_add")}>
            <Plus className="size-4" />
          </Button>
        ) : (
          <Button data-testid="skill-add">
            <Plus className="size-4" />
            {t("agent:skills_add")}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-testid="skill-upload-zip" onSelect={() => fileInputRef.current?.click()}>
          <Upload className="size-4" />
          {t("agent:skills_install_zip")}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="skill-import-url" onSelect={() => setUrlOpen(true)}>
          <Link2 className="size-4" />
          {t("agent:skills_install_url")}
        </DropdownMenuItem>
        {isMobile && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="skill-check-updates" onSelect={handleCheckUpdates}>
              <RefreshCw className="size-4" />
              {t("agent:skills_check_updates")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // 计数摘要:已安装数 + (可选)可更新数(琥珀色)
  const countSegments: CountBarSegment[] = [
    { label: t("agent:skills_count", { count: skills.length, defaultValue: "已安装 {{count}} 个 Skill" }) },
    ...(updateCount > 0
      ? [
          {
            label: t("agent:skills_update_count", { count: updateCount, defaultValue: "{{count}} 个有可用更新" }),
            tone: "warning" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* 桌面页头:统一 64px,右侧「文档 / 检查更新 / 添加」。移动端由全局 MobileHeader 承担顶栏,本页不叠加第二条标题栏(避免双头部)。 */}
      {!isMobile && (
        <AgentPageHeader
          icon={Sparkles}
          title={t("agent:skills_title")}
          subtitle={t("agent:skills_subtitle")}
          docHref={DOC_URL}
          docLabel={t("agent:skills_docs", { defaultValue: "文档" })}
          actions={
            <>
              <Button
                variant="outline"
                data-testid="skill-check-updates"
                disabled={checking}
                onClick={handleCheckUpdates}
              >
                <RefreshCw className={`size-4${checking ? " animate-spin" : ""}`} />
                {t("agent:skills_check_updates")}
              </Button>
              {addMenu}
            </>
          }
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        data-testid="skill-zip-input"
        className="hidden"
        onChange={handleZip}
      />

      <div className="scrollbar-custom flex-1 overflow-y-auto px-4 py-4 md:px-7 md:py-[22px]">
        {skills.length === 0 ? (
          <AgentEmptyState
            icon={Sparkles}
            title={t("agent:skills_empty")}
            description={t("agent:skills_empty_desc")}
            action={
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" />
                {t("agent:skills_install_zip")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {/* 移动端页内顶行:页面名称 + 添加入口(全局 MobileHeader 仅显示静态 ScriptCat 与 ☰/脚本菜单) */}
            {isMobile && (
              <div className="flex items-center justify-between gap-3">
                <h1 data-testid="skills-mobile-heading" className="text-[17px] font-semibold text-foreground">
                  {t("agent:skills_title")}
                </h1>
                {addMenu}
              </div>
            )}
            {/* 统计摘要条 */}
            <CountBar segments={countSegments} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {skills.map((s) => (
                <SkillCard
                  key={s.name}
                  skill={s}
                  updateAvailable={updateMap[s.name]}
                  onDetail={() => handleDetail(s.name)}
                  onPreloadDetail={() => void preloadSkillDetail(s.name).catch(() => undefined)}
                  onToggleEnabled={(enabled) => handleToggleEnabled(s.name, enabled)}
                  onUpdate={() => handleUpdate(s.name)}
                  onRefresh={() => handleRefresh(s.name)}
                  onUninstall={() => setUninstallTarget(s)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 从 URL 导入对话框 */}
      <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("agent:skills_install_url")}</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="skill-url-input"
            value={url}
            placeholder={t("agent:skills_url_placeholder")}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUrl();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrlOpen(false)}>
              {t("common:cancel")}
            </Button>
            <Button data-testid="skill-url-confirm" disabled={busy} onClick={handleUrl}>
              {t("common:import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <SkillDetailDialog
        detail={detail}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open && detail) invalidateSkillDetail(detail.record.name);
        }}
        onOpenConfig={() => {
          setDetailOpen(false);
          setConfigOpen(true);
        }}
      />

      {/* 配置弹窗 */}
      <SkillConfigDialog skill={detail?.record ?? null} open={configOpen} onOpenChange={setConfigOpen} />

      {/* 卸载确认 */}
      <AlertDialog open={!!uninstallTarget} onOpenChange={(o) => !o && setUninstallTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agent:skills_uninstall")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("agent:skills_uninstall_confirm", { name: uninstallTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="skill-uninstall-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmUninstall}
            >
              {t("agent:skills_uninstall")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
