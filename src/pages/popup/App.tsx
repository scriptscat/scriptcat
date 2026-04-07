import { useState, useEffect, useMemo } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import {
  Settings,
  Bell,
  MoreVertical,
  ChevronDown,
  Menu as MenuIcon,
  Pencil,
  MinusCircle,
  PlusCircle,
  Trash2,
  RefreshCw,
  Search,
  Play,
  Square,
  Loader2,
  Plus,
  Bug,
  BookOpen,
  MessageCircle,
} from "lucide-react";
import { GithubIcon } from "../components/icons/GithubIcon";
import { Switch } from "../components/ui/switch";
import { Input } from "../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../components/ui/dropdown-menu";
import { Popconfirm } from "../components/ui/popconfirm";
import { usePopupData, getVisibleMenuItems, ExtVersion, VersionCompare, versionCompare } from "./usePopupData";
import type { ScriptMenu, ScriptMenuItem } from "@App/app/service/service_worker/types";
import { SCRIPT_RUN_STATUS_RUNNING, SCRIPT_RUN_STATUS_ERROR } from "@App/app/repo/scripts";
import { Discord, DocumentationSite } from "@App/app/const";
import { isChineseUser, localePath, t, i18nLang } from "@App/locales/locales";

export default function App() {
  const data = usePopupData();

  // accessKey 键盘快捷键
  const { handleMenuClick } = data;
  const allScripts = useMemo(
    () => [...data.scriptList, ...data.backScriptList],
    [data.scriptList, data.backScriptList]
  );
  useEffect(() => {
    const checkItems = new Map<string, { uuid: string; key: string; menus: ScriptMenuItem[] }>();
    for (const script of allScripts) {
      const visibleMenus = getVisibleMenuItems(script.menus);
      for (const menuItem of visibleMenus) {
        const accessKey = menuItem.options?.accessKey;
        if (typeof accessKey === "string") {
          const sameGroup = script.menus.filter((m) => m.groupKey === menuItem.groupKey);
          checkItems.set(`${script.uuid}:${menuItem.groupKey}`, {
            uuid: script.uuid,
            key: accessKey.toUpperCase(),
            menus: sameGroup,
          });
        }
      }
    }
    if (!checkItems.size) return;
    const listener = (e: KeyboardEvent) => {
      const keyUpper = e.key.toUpperCase();
      checkItems.forEach(({ uuid, key, menus }) => {
        if (keyUpper === key) handleMenuClick(uuid, menus);
      });
    };
    document.addEventListener("keypress", listener);
    return () => document.removeEventListener("keypress", listener);
  }, [allScripts, handleMenuClick]);

  if (data.loading) {
    return (
      <div className="w-[380px] flex items-center justify-center bg-background text-foreground py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-[380px] flex flex-col bg-background text-foreground">
      {/* 黑名单警告 */}
      {data.isBlacklist && (
        <div className="px-4 py-2 bg-warning-bg text-warning-fg text-[12px] font-medium border-b border-border">
          {t("blacklist_warning", { defaultValue: "当前网址在黑名单中，所有脚本已被禁止运行" })}
        </div>
      )}
      <Header
        isEnableScript={data.isEnableScript}
        onToggleEnableScript={data.handleToggleEnableScript}
        onOpenSettings={data.handleOpenSettings}
        checkUpdate={data.checkUpdate}
        onNotificationClick={data.handleNotificationClick}
        host={data.host}
        onCreateScript={data.handleCreateScript}
        onMenuCheckUpdate={data.handleMenuCheckUpdate}
      />
      {/* 错误提示 */}
      {data.errorMessage && (
        <div className="px-4 py-2 border-b border-border bg-destructive/10 text-destructive text-[12px]">
          {data.errorMessage}
        </div>
      )}
      {/* 通知公告面板 */}
      {data.showAlert && (
        <div className="px-4 py-2 border-b border-border bg-primary-light">
          {data.checkUpdate.notice ? (
            <div
              className="text-[12px] text-foreground"
              dangerouslySetInnerHTML={{ __html: data.checkUpdate.notice }}
            />
          ) : (
            <div className="text-[12px] text-muted-foreground">{t("no_data")}</div>
          )}
        </div>
      )}
      {data.showSearch && <SearchBar value={data.searchQuery} onChange={data.handleSearch} />}
      <div className="max-h-[500px] overflow-auto">
        <AccordionPrimitive.Root
          type="multiple"
          defaultValue={data.fullBackScriptCount > 0 ? ["current", "background"] : ["current"]}
        >
          <Section
            id="current"
            title={t("current_page_scripts")}
            enabledCount={data.enabledScriptCount}
            totalCount={data.fullScriptCount}
          >
            {data.scriptList.map((script) => (
              <ScriptRow
                key={script.uuid}
                script={script}
                host={data.host}
                isPageScript
                menuExpandNum={data.menuExpandNum}
                onToggle={data.handleToggleScript}
                onDelete={data.handleDeleteScript}
                onOpenEditor={data.handleOpenEditor}
                onOpenUserConfig={data.handleOpenUserConfig}
                onExcludeUrl={data.handleExcludeUrl}
                onMenuClick={data.handleMenuClick}
              />
            ))}
            {data.remainingCurrentCount > 0 && (
              <ShowMoreButton count={data.remainingCurrentCount} onClick={() => data.handleToggleExpand("current")} />
            )}
            {data.fullScriptCount === 0 && <EmptyHint>{t("no_data")}</EmptyHint>}
          </Section>
          <Divider />
          <Section
            id="background"
            title={t("enabled_background_scripts")}
            enabledCount={data.enabledBackScriptCount}
            totalCount={data.fullBackScriptCount}
            runningSummary={
              data.backRunningCount > 0
                ? `${data.backRunningCount} ${t("running", { defaultValue: "运行中" })}`
                : undefined
            }
          >
            {data.backScriptList.map((script) => (
              <ScriptRow
                key={script.uuid}
                script={script}
                isPageScript={false}
                menuExpandNum={data.menuExpandNum}
                onToggle={data.handleToggleScript}
                onDelete={data.handleDeleteScript}
                onOpenEditor={data.handleOpenEditor}
                onOpenUserConfig={data.handleOpenUserConfig}
                onMenuClick={data.handleMenuClick}
                onRun={data.handleRunScript}
                onStop={data.handleStopScript}
              />
            ))}
            {data.remainingBackCount > 0 && (
              <ShowMoreButton count={data.remainingBackCount} onClick={() => data.handleToggleExpand("background")} />
            )}
            {data.fullBackScriptCount === 0 && <EmptyHint>{t("no_data")}</EmptyHint>}
          </Section>
        </AccordionPrimitive.Root>
      </div>
      <Footer
        checkUpdate={data.checkUpdate}
        checkUpdateStatus={data.checkUpdateStatus}
        onVersionClick={data.handleVersionClick}
      />
    </div>
  );
}

// ========== Header ==========
function Header({
  isEnableScript,
  onToggleEnableScript,
  onOpenSettings,
  checkUpdate,
  onNotificationClick,
  host,
  onCreateScript,
  onMenuCheckUpdate,
}: {
  isEnableScript: boolean;
  onToggleEnableScript: (val: boolean) => void;
  onOpenSettings: () => void;
  checkUpdate: { notice: string; isRead: boolean };
  onNotificationClick: () => void;
  host: string;
  onCreateScript: () => void;
  onMenuCheckUpdate: () => void;
}) {
  const hasUnreadNotice = !checkUpdate.isRead;

  return (
    <header className="h-12 px-4 flex items-center gap-2.5 bg-card border-b border-border">
      <h1 className="text-[15px] font-semibold text-foreground">{"ScriptCat"}</h1>
      <div className="flex-1" />
      <Switch checked={isEnableScript} onCheckedChange={onToggleEnableScript} />
      <HeaderIconButton aria-label="设置" onClick={onOpenSettings}>
        <Settings className="w-4 h-4" />
      </HeaderIconButton>
      <HeaderIconButton aria-label="通知" badge={hasUnreadNotice} onClick={onNotificationClick}>
        <Bell className="w-4 h-4" />
      </HeaderIconButton>
      <MoreMenu host={host} onCreateScript={onCreateScript} onMenuCheckUpdate={onMenuCheckUpdate} />
    </header>
  );
}

function HeaderIconButton({
  children,
  badge = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { badge?: boolean }) {
  return (
    <button
      type="button"
      className="relative w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      {...props}
    >
      {children}
      {badge && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-destructive" />}
    </button>
  );
}

// ========== More Menu (匹配设计稿 DropdownPanel - More Menu) ==========
function MoreMenu({
  host,
  onCreateScript,
  onMenuCheckUpdate,
}: {
  host: string;
  onCreateScript: () => void;
  onMenuCheckUpdate: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="更多菜单"
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onCreateScript}>
          <Plus className="w-4 h-4" />
          {t("create_script")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            onClick={(e) => {
              e.stopPropagation();
              window.open(`https://scriptcat.org/search?domain=${host}`, "_blank");
            }}
          >
            <Search className="w-4 h-4" />
            {t("get_script")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => window.open(`https://scriptcat.org/search?domain=${host}`, "_blank")}>
              {"ScriptCat"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`https://greasyfork.org/scripts/by-site/${host}`, "_blank")}>
              {"Greasy Fork"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`https://openuserjs.org/?q=${host}`, "_blank")}>
              {"OpenUserJS"}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onMenuCheckUpdate}>
          <RefreshCw className="w-4 h-4" />
          {t("check_update")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const browserInfo = navigator.userAgent;
            const issueUrl =
              `https://github.com/scriptscat/scriptcat/issues/new?` +
              `template=bug_report${isChineseUser() ? "" : "_en"}.yaml&scriptcat-version=${ExtVersion}&` +
              `browser-version=${encodeURIComponent(browserInfo)}`;
            window.open(issueUrl, "_blank");
          }}
        >
          <Bug className="w-4 h-4" />
          {t("report_issue")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.open(`${DocumentationSite}${localePath}`, "_blank")}>
          <BookOpen className="w-4 h-4" />
          {t("project_docs")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(isChineseUser() ? "https://bbs.tampermonkey.net.cn/" : Discord, "_blank")}
        >
          <MessageCircle className="w-4 h-4" />
          {t("community")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open("https://github.com/scriptscat/scriptcat", "_blank")}>
          <GithubIcon className="w-4 h-4" />
          {"GitHub"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ========== Search ==========
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="px-4 py-2 border-b border-border">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("search_scripts", { defaultValue: "搜索脚本..." })}
          className="h-8 pl-8 text-[13px]"
        />
      </div>
    </div>
  );
}

// ========== Section (Accordion) ==========
interface SectionProps {
  id: string;
  title: string;
  enabledCount: number;
  totalCount: number;
  runningSummary?: string;
  children: React.ReactNode;
}

function Section({ id, title, enabledCount, totalCount, runningSummary, children }: SectionProps) {
  return (
    <AccordionPrimitive.Item value={id}>
      <AccordionPrimitive.Header className="flex">
        <AccordionPrimitive.Trigger className="flex flex-1 items-center gap-1.5 h-9 px-4 text-left group focus:outline-none hover:bg-accent transition-colors">
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          <span className="text-xs font-semibold text-fg-secondary">{`${title} (${enabledCount}/${totalCount})`}</span>
          <div className="flex-1" />
          {runningSummary && (
            <span className="inline-flex items-center gap-1 text-[10px] text-success mr-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {runningSummary}
            </span>
          )}
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        {children}
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

function Divider() {
  return <div className="h-px bg-border" />;
}

function ShowMoreButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1 h-8 w-full text-[12px] text-primary hover:bg-accent transition-colors"
    >
      {`+${count} 个脚本`}
      <ChevronDown className="w-3 h-3" />
    </button>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="py-4 text-center text-[12px] text-muted-foreground">{children}</div>;
}

// ========== Script Row ==========
interface ScriptRowProps {
  script: ScriptMenu;
  host?: string;
  isPageScript?: boolean;
  menuExpandNum?: number;
  onToggle: (uuid: string, enable: boolean) => void;
  onDelete: (uuid: string) => void;
  onOpenEditor: (uuid: string) => void;
  onOpenUserConfig: (uuid: string) => void;
  onExcludeUrl?: (uuid: string, isEffective: boolean) => void;
  onMenuClick: (uuid: string, menus: ScriptMenuItem[], inputValue?: any) => void;
  onRun?: (uuid: string) => void;
  onStop?: (uuid: string) => void;
}

// 解析脚本本地化名称
function getScriptDisplayName(script: ScriptMenu): string {
  if (!script.localizedNames) return script.name;
  const lang = i18nLang();
  const prefix = lang.split("-")[0];
  return script.localizedNames[lang] || script.localizedNames[prefix] || script.name;
}

function ScriptRow({
  script,
  host,
  isPageScript = true,
  menuExpandNum = 5,
  onToggle,
  onDelete,
  onOpenEditor,
  onOpenUserConfig,
  onExcludeUrl,
  onMenuClick,
  onRun,
  onStop,
}: ScriptRowProps) {
  const allVisibleMenus = getVisibleMenuItems(script.menus);
  const [isActive, setIsActive] = useState(false);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  // menuExpandNum=0 时跟随折叠面板状态；>0 时按数量截断
  const shouldTruncateMenus = menuExpandNum > 0 && allVisibleMenus.length > menuExpandNum;
  const visibleMenus = (() => {
    if (menuExpandNum === 0) return isActive ? allVisibleMenus : [];
    if (shouldTruncateMenus && !isMenuExpanded) return allVisibleMenus.slice(0, menuExpandNum);
    return allVisibleMenus;
  })();
  const statusBadge = getStatusBadge(script);
  const displayName = getScriptDisplayName(script);

  // 运行次数 tooltip
  const runTitle = !script.enable
    ? t("script_disabled")
    : script.runNumByIframe
      ? t("script_total_runs", { runNum: script.runNum, runNumByIframe: script.runNumByIframe })
      : t("script_total_runs_single", { runNum: script.runNum });

  return (
    <CollapsiblePrimitive.Root open={isActive} onOpenChange={setIsActive}>
      <div className="flex items-center gap-2.5 h-11 px-4 hover:bg-accent transition-colors">
        <CollapsiblePrimitive.Trigger className="flex flex-1 items-center gap-2.5 min-w-0 text-left focus:outline-none">
          <ScriptIcon icon={script.icon} enable={script.enable} />
          <span
            className={`text-[13px] font-medium truncate ${script.runNum > 0 ? "text-foreground" : "text-muted-foreground"}`}
            title={runTitle}
          >
            {displayName}
          </span>
        </CollapsiblePrimitive.Trigger>
        {statusBadge}
        <Switch size="sm" checked={script.enable} onCheckedChange={(checked) => onToggle(script.uuid, checked)} />
      </div>

      {/* 折叠区域：操作按钮（点击展开） */}
      <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex flex-col gap-0.5 pl-11 pr-4 pt-1 pb-2">
          {/* 运行/停止（仅后台脚本） */}
          {!isPageScript && onRun && onStop && (
            <>
              {script.runStatus === SCRIPT_RUN_STATUS_RUNNING ? (
                <ActionItem icon={<Square className="w-3.5 h-3.5" />} danger onClick={() => onStop(script.uuid)}>
                  {t("stop")}
                </ActionItem>
              ) : (
                <ActionItem icon={<Play className="w-3.5 h-3.5" />} onClick={() => onRun(script.uuid)}>
                  {t("run_once")}
                </ActionItem>
              )}
            </>
          )}
          {/* 编辑 */}
          <ActionItem icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onOpenEditor(script.uuid)}>
            {t("edit")}
          </ActionItem>
          {/* 排除/取消排除 host（无二次确认，与旧版一致） */}
          {isPageScript && host && onExcludeUrl && script.isEffective !== null && (
            <ActionItem
              icon={
                script.isEffective ? <MinusCircle className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />
              }
              warn={script.isEffective === true}
              success={script.isEffective === false}
              onClick={() => onExcludeUrl(script.uuid, script.isEffective!)}
            >
              {script.isEffective ? t("exclude_off").replace("$0", host) : t("exclude_on").replace("$0", host)}
            </ActionItem>
          )}
          {/* 删除（AlertDialog 二次确认） */}
          <Popconfirm
            description={t("confirm_delete_script_content", { name: displayName })}
            onConfirm={() => onDelete(script.uuid)}
            destructive
            confirmText={t("delete")}
          >
            <ActionItem icon={<Trash2 className="w-3.5 h-3.5" />} danger>
              {t("delete")}
            </ActionItem>
          </Popconfirm>
        </div>
      </CollapsiblePrimitive.Content>

      {/* 始终可见区域：GM 菜单、用户配置（与旧版一致，不在折叠内） */}
      {(visibleMenus.length > 0 || script.hasUserConfig) && (
        <div className="flex flex-col gap-0.5 pl-11 pr-4 pb-1">
          {visibleMenus.map((menuItem) =>
            menuItem.options?.inputType ? (
              <InputMenuItem
                key={menuItem.groupKey}
                menuItem={menuItem}
                allMenus={script.menus}
                uuid={script.uuid}
                onMenuClick={onMenuClick}
              />
            ) : (
              <ActionItem
                key={menuItem.groupKey}
                icon={<MenuIcon className="w-3.5 h-3.5" />}
                onClick={() => {
                  const sameGroup = script.menus.filter(
                    (m) => m.groupKey === menuItem.groupKey && !m.options?.inputType
                  );
                  onMenuClick(script.uuid, sameGroup);
                }}
              >
                {menuItem.name}
                {menuItem.options?.accessKey && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {`(${menuItem.options.accessKey.toUpperCase()})`}
                  </span>
                )}
              </ActionItem>
            )
          )}
          {/* 菜单展开/收起 */}
          {shouldTruncateMenus && (
            <button
              type="button"
              onClick={() => setIsMenuExpanded((prev) => !prev)}
              className="h-[30px] px-2 flex items-center gap-2 rounded-md text-[13px] text-primary hover:bg-accent transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMenuExpanded ? "rotate-180" : ""}`} />
              <span>{isMenuExpanded ? t("collapse") : t("expand")}</span>
            </button>
          )}
          {/* 用户配置 */}
          {script.hasUserConfig && (
            <ActionItem icon={<Settings className="w-3.5 h-3.5" />} onClick={() => onOpenUserConfig(script.uuid)}>
              {t("user_config")}
            </ActionItem>
          )}
        </div>
      )}
    </CollapsiblePrimitive.Root>
  );
}

function getStatusBadge(script: ScriptMenu): React.ReactNode {
  if (script.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
    return <Tag variant="info">{"运行中"}</Tag>;
  }
  if (script.runStatus === SCRIPT_RUN_STATUS_ERROR) {
    return <Tag variant="destructive">{"错误"}</Tag>;
  }
  return null;
}

// ========== InputMenuItem（带输入框的菜单项） ==========
function InputMenuItem({
  menuItem,
  allMenus,
  uuid,
  onMenuClick,
}: {
  menuItem: ScriptMenuItem;
  allMenus: ScriptMenuItem[];
  uuid: string;
  onMenuClick: (uuid: string, menus: ScriptMenuItem[], inputValue?: any) => void;
}) {
  const opts = menuItem.options!;
  const [value, setValue] = useState<string | number | boolean>(opts.inputDefaultValue ?? "");

  const submit = () => {
    const sameGroup = allMenus.filter((m) => m.groupKey === menuItem.groupKey);
    onMenuClick(uuid, sameGroup, value);
  };

  if (opts.inputType === "boolean") {
    return (
      <div className="h-[30px] px-2 flex items-center gap-2 rounded-md text-[13px]">
        <MenuIcon className="w-3.5 h-3.5" />
        <span className="flex-1 truncate">{opts.inputLabel || menuItem.name}</span>
        <Switch
          size="sm"
          checked={!!value}
          onCheckedChange={(checked) => {
            setValue(checked);
            const sameGroup = allMenus.filter((m) => m.groupKey === menuItem.groupKey);
            onMenuClick(uuid, sameGroup, checked);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <span className="text-[11px] text-muted-foreground">{opts.inputLabel || menuItem.name}</span>
      <div className="flex gap-1.5">
        <Input
          type={opts.inputType === "number" ? "number" : "text"}
          value={String(value)}
          onChange={(e) => setValue(opts.inputType === "number" ? Number(e.target.value) : e.target.value)}
          placeholder={opts.inputPlaceholder}
          className="h-7 text-[12px] flex-1"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          type="button"
          onClick={submit}
          className="h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary-hover transition-colors"
        >
          {"确认"}
        </button>
      </div>
    </div>
  );
}

// ========== ActionItem ==========
interface ActionItemProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  warn?: boolean;
  success?: boolean;
  onClick?: () => void;
}

function ActionItem({ icon, children, danger = false, warn = false, success = false, onClick }: ActionItemProps) {
  const color = danger
    ? "text-destructive hover:text-destructive"
    : warn
      ? "text-type-orange hover:text-type-orange"
      : success
        ? "text-type-green hover:text-type-green"
        : "";
  return (
    <button
      type="button"
      className={`h-[30px] px-2 flex items-center gap-2 rounded-md text-[13px] text-left transition-colors hover:bg-accent ${color}`}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}

// ========== Tag ==========
interface TagProps {
  variant: "info" | "muted" | "destructive";
  children: React.ReactNode;
}

function Tag({ variant, children }: TagProps) {
  const cls =
    variant === "info"
      ? "bg-primary-light text-primary"
      : variant === "destructive"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-fg-secondary";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium shrink-0 ${cls}`}>
      {children}
    </span>
  );
}

// ========== ScriptIcon ==========
function ScriptIcon({ icon, enable }: { icon?: string; enable: boolean }) {
  const [error, setError] = useState(false);
  if (icon && !error) {
    return (
      <img src={icon} alt="" className="w-5 h-5 shrink-0 rounded-sm object-cover" onError={() => setError(true)} />
    );
  }
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${enable ? "bg-success" : "bg-muted-foreground"}`} />;
}

// ========== Footer ==========
function Footer({
  checkUpdate,
  checkUpdateStatus,
  onVersionClick,
}: {
  checkUpdate: { version: string };
  checkUpdateStatus: number;
  onVersionClick: () => void;
}) {
  const hasNewVersion = versionCompare(ExtVersion, checkUpdate.version) === VersionCompare.LESS;

  return (
    <footer className="h-9 px-4 flex items-center border-t border-border">
      {hasNewVersion ? (
        <span
          onClick={() => window.open(`https://github.com/scriptscat/scriptcat/releases/tag/v${checkUpdate.version}`)}
          title={`${t("popup.new_version_available")} (v${checkUpdate.version})`}
          className="text-[12px] font-medium text-primary underline underline-offset-2 cursor-pointer"
        >{`v${ExtVersion}`}</span>
      ) : checkUpdateStatus === 0 ? (
        <span
          onClick={onVersionClick}
          title={t("check_update")}
          className="text-[12px] font-medium text-muted-foreground cursor-pointer hover:underline hover:underline-offset-2"
        >{`v${ExtVersion}`}</span>
      ) : checkUpdateStatus === 1 ? (
        <span className="text-[12px] font-medium text-muted-foreground">{t("checking_for_updates")}</span>
      ) : (
        <span
          onClick={onVersionClick}
          title={t("check_update")}
          className="text-[12px] font-medium text-muted-foreground cursor-pointer hover:underline hover:underline-offset-2"
        >
          {t("latest_version")}
        </span>
      )}
    </footer>
  );
}
