import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import {
  FolderTree,
  HardDrive,
  Folder,
  File,
  Braces,
  FileText,
  Image as ImageIcon,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Upload,
  Loader2,
  Eye,
  Download,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { Progress } from "@App/pages/components/ui/progress";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { dayFormat } from "@App/pkg/utils/day_format";
import { cn } from "@App/pkg/utils/cn";
import { AgentPageHeader } from "../components/AgentPageHeader";
import { AgentEmptyState } from "../components/AgentEmptyState";
import { AgentCardMenu, type AgentCardMenuItem } from "../components/AgentCardMenu";
import { PreviewDialog } from "./PreviewDialog";
import {
  listDir,
  removeEntry,
  readFileText,
  getFileBlob,
  writeFile,
  formatSize,
  fileKind,
  type FileEntry,
  type FileKind,
} from "./opfs_fs";

type PreviewState = { open: boolean; name: string; kind: FileKind; text?: string; imageUrl?: string };
type SortKey = "name" | "size" | "time";

const PREVIEWABLE: FileKind[] = ["json", "md", "text", "img"];

// 类型 → 图标 + 类型色(对照设计稿:文件夹橙 / JSON 紫 / Markdown·文本 蓝 / 图片 绿 / 二进制 灰)
const KIND_META: Record<"directory" | FileKind, { icon: LucideIcon; color: string }> = {
  directory: { icon: Folder, color: "text-warning" },
  json: { icon: Braces, color: "text-skill" },
  md: { icon: FileText, color: "text-primary" },
  text: { icon: FileText, color: "text-primary" },
  img: { icon: ImageIcon, color: "text-success" },
  bin: { icon: File, color: "text-muted-foreground" },
};

function entryMeta(entry: FileEntry) {
  return entry.kind === "directory" ? KIND_META.directory : KIND_META[fileKind(entry.name)];
}

export default function AgentOPFS() {
  const { t } = useTranslation(["agent", "common"]);
  const isMobile = useIsMobile();
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void navigator.storage.getDirectory().then(setRoot);
  }, []);

  const load = useCallback(async () => {
    if (!root) return;
    setLoading(true);
    try {
      setEntries(await listDir(root, path));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [root, path]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // 目录恒置顶,组内按当前排序键升/降序(保留 v1.4 的大小/时间列排序)
  const sorted = useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      let cmp = 0;
      if (sort.key === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
      else if (sort.key === "time") cmp = (a.lastModified ?? 0) - (b.lastModified ?? 0);
      else cmp = a.name.localeCompare(b.name);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [entries, sort]);

  const totalSize = useMemo(() => entries.reduce((sum, e) => sum + (e.size ?? 0), 0), [entries]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const openEntry = async (entry: FileEntry) => {
    if (entry.kind === "directory") {
      setPath((p) => [...p, entry.name]);
      return;
    }
    if (!root) return;
    const kind = fileKind(entry.name);
    if (!PREVIEWABLE.includes(kind)) return;
    if (kind === "img") {
      const blob = await getFileBlob(root, path, entry.name);
      setPreview({ open: true, name: entry.name, kind, imageUrl: URL.createObjectURL(blob) });
    } else {
      const text = await readFileText(root, path, entry.name);
      setPreview({ open: true, name: entry.name, kind, text });
    }
  };

  const handleDownload = async (entry: FileEntry) => {
    if (!root) return;
    const blob = await getFileBlob(root, path, entry.name);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (entry: FileEntry) => {
    if (!root) return;
    await removeEntry(root, path, entry.name, entry.kind);
    notify.success(t("agent:opfs_delete_success"));
    await load();
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 允许重复选择同名文件
    if (!root || files.length === 0) return;
    // §9 无静默操作:写入期间禁用上传并展示忙碌指示(单动作内联 spinner + 多文件顶部进度条)
    setUploading(true);
    try {
      for (const file of files) {
        await writeFile(root, path, file.name, file);
      }
      notify.success(t("agent:opfs_upload_success"));
      await load();
    } catch {
      notify.error(t("agent:opfs_upload_failed"));
    } finally {
      setUploading(false);
    }
  };

  const closePreview = () => {
    if (preview?.imageUrl) URL.revokeObjectURL(preview.imageUrl);
    setPreview(null);
  };

  const crumbs = [t("agent:opfs_root"), ...path];

  const typeLabel = (entry: FileEntry) => {
    if (entry.kind === "directory") return t("agent:opfs_type_directory");
    switch (fileKind(entry.name)) {
      case "json":
        return "JSON";
      case "md":
        return "Markdown";
      case "img":
        return t("agent:opfs_type_image");
      case "text":
        return t("agent:opfs_type_text");
      default:
        return t("agent:opfs_type_binary");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* §9 上传进行中:顶部不确定进度条(多文件时的整体进度信号,贴页顶不随内容滚动) */}
      {uploading && (
        <Progress
          variant="top"
          indeterminate
          data-testid="opfs-upload-progress"
          aria-label={t("agent:opfs_uploading")}
        />
      )}

      {/* 隐藏的上传文件选择器:桌面页头与移动工具行共用 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        data-testid="opfs-upload-input"
        onChange={handleUpload}
      />

      {/* 桌面:64px 页头(移动端由全局 MobileHeader 提供顶栏,避免双层堆叠) */}
      {!isMobile && (
        <AgentPageHeader
          icon={FolderTree}
          title={t("agent:opfs_title")}
          subtitle={t("agent:opfs_subtitle")}
          actions={
            <>
              <Button variant="outline" data-testid="opfs-refresh" onClick={load}>
                <RefreshCw className="size-4" />
                {t("agent:opfs_refresh")}
              </Button>
              <Button data-testid="opfs-upload" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {uploading ? t("agent:opfs_uploading") : t("agent:opfs_upload")}
              </Button>
            </>
          }
        />
      )}

      <div className="scrollbar-custom flex flex-1 flex-col gap-3.5 overflow-y-auto p-4 md:px-7 md:py-5">
        {/* 移动:页内紧凑工具行(标题 + 刷新/上传图标按钮),替代被抑制的页头 */}
        {isMobile && (
          <div className="flex items-center gap-2">
            <span data-testid="opfs-mobile-title" className="flex-1 truncate text-lg font-semibold text-foreground">
              {t("agent:opfs_title")}
            </span>
            <Button
              variant="outline"
              size="icon"
              data-testid="opfs-refresh"
              aria-label={t("agent:opfs_refresh")}
              onClick={load}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              size="icon"
              data-testid="opfs-upload"
              disabled={uploading}
              aria-label={uploading ? t("agent:opfs_uploading") : t("agent:opfs_upload")}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            </Button>
          </div>
        )}

        {/* 面包屑 + 统计 */}
        <div className="flex items-center gap-1.5 text-sm">
          <HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
          {crumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
              <button
                type="button"
                data-testid={`crumb-${i}`}
                onClick={() => setPath(path.slice(0, i))}
                className={cn(
                  "rounded px-1 py-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  i === crumbs.length - 1 ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                )}
              >
                {part}
              </button>
            </span>
          ))}
          <div className="flex-1" />
          {!loading && (
            <span data-testid="opfs-count" className="shrink-0 text-xs text-muted-foreground">
              {`${t("agent:opfs_item_count", { count: entries.length })} · ${formatSize(totalSize)}`}
            </span>
          )}
        </div>

        {!loading && entries.length === 0 ? (
          <AgentEmptyState icon={Folder} title={t("agent:opfs_empty")} description={t("agent:opfs_empty_desc")} />
        ) : isMobile ? (
          <div className="flex flex-col gap-2">
            {sorted.map((entry) => {
              const meta = entryMeta(entry);
              const sub = [
                typeLabel(entry),
                ...(entry.kind === "file" && entry.size != null ? [formatSize(entry.size)] : []),
                ...(entry.lastModified ? [dayFormat(new Date(entry.lastModified), "MM-DD HH:mm")] : []),
              ].join(" · ");
              return (
                <div
                  key={entry.name}
                  className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3"
                >
                  <div className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-muted">
                    <meta.icon className={cn("size-[18px]", meta.color)} />
                  </div>
                  <button
                    type="button"
                    data-testid={`entry-${entry.name}`}
                    onClick={() => openEntry(entry)}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 rounded text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        "truncate text-sm font-medium text-foreground",
                        entry.kind === "file" && "font-mono"
                      )}
                    >
                      {entry.name}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">{sub}</span>
                  </button>
                  <AgentCardMenu items={menuItems(entry, { openEntry, handleDownload, handleDelete, t })} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <span className="flex-1 px-3.5 py-2.5">{t("agent:opfs_name")}</span>
              <span className="w-[140px] px-3.5 py-2.5">{t("agent:opfs_type")}</span>
              <SortHeader
                className="w-[120px]"
                label={t("agent:opfs_size")}
                active={sort.key === "size"}
                dir={sort.dir}
                onClick={() => toggleSort("size")}
              />
              <SortHeader
                className="w-[190px]"
                label={t("agent:opfs_modified")}
                active={sort.key === "time"}
                dir={sort.dir}
                onClick={() => toggleSort("time")}
              />
              <span className="w-[140px] px-3.5 py-2.5">{t("agent:opfs_actions")}</span>
            </div>
            {sorted.map((entry) => {
              const meta = entryMeta(entry);
              return (
                <div
                  key={entry.name}
                  className="flex items-center border-b border-border last:border-b-0 hover:bg-accent/40"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2.5">
                    <div className="flex size-[30px] shrink-0 items-center justify-center rounded-md bg-muted">
                      <meta.icon className={cn("size-4", meta.color)} />
                    </div>
                    <button
                      type="button"
                      data-testid={`entry-${entry.name}`}
                      onClick={() => openEntry(entry)}
                      className={cn(
                        "truncate rounded text-left text-[13px] text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                        entry.kind === "directory" ? "font-medium" : "font-mono"
                      )}
                    >
                      {entry.name}
                    </button>
                  </div>
                  <span className="w-[140px] px-3.5 text-[13px] text-fg-secondary">{typeLabel(entry)}</span>
                  <span className="w-[120px] px-3.5 font-mono text-xs text-fg-secondary">
                    {entry.size != null ? formatSize(entry.size) : "—"}
                  </span>
                  <span className="w-[190px] px-3.5 font-mono text-xs text-muted-foreground">
                    {entry.lastModified ? dayFormat(new Date(entry.lastModified), "YYYY-MM-DD HH:mm") : "—"}
                  </span>
                  <div className="flex w-[140px] items-center justify-end gap-0.5 px-3.5">
                    <RowActions
                      entry={entry}
                      onPreview={openEntry}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                      t={t}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {preview && (
        <PreviewDialog
          open={preview.open}
          name={preview.name}
          kind={preview.kind}
          text={preview.text}
          imageUrl={preview.imageUrl}
          onOpenChange={(v) => (v ? undefined : closePreview())}
        />
      )}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      {label}
      {active && (dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
    </button>
  );
}

// 移动端 kebab 菜单项:按类型给出 预览 / 下载 / 删除
function menuItems(
  entry: FileEntry,
  {
    openEntry,
    handleDownload,
    handleDelete,
    t,
  }: {
    openEntry: (e: FileEntry) => void | Promise<void>;
    handleDownload: (e: FileEntry) => void | Promise<void>;
    handleDelete: (e: FileEntry) => void | Promise<void>;
    t: (k: string) => string;
  }
): AgentCardMenuItem[] {
  const items: AgentCardMenuItem[] = [];
  if (entry.kind === "file" && PREVIEWABLE.includes(fileKind(entry.name))) {
    items.push({ key: "preview", label: t("agent:opfs_preview"), icon: Eye, onSelect: () => void openEntry(entry) });
  }
  if (entry.kind === "file") {
    items.push({
      key: "download",
      label: t("common:download"),
      icon: Download,
      onSelect: () => void handleDownload(entry),
    });
  }
  items.push({
    key: "delete",
    label: t("common:delete"),
    icon: Trash2,
    danger: true,
    onSelect: () => void handleDelete(entry),
  });
  return items;
}

function RowActions({
  entry,
  onPreview,
  onDownload,
  onDelete,
  t,
}: {
  entry: FileEntry;
  onPreview: (e: FileEntry) => void;
  onDownload: (e: FileEntry) => void;
  onDelete: (e: FileEntry) => void;
  t: (k: string) => string;
}) {
  const canPreview = entry.kind === "file" && PREVIEWABLE.includes(fileKind(entry.name));
  return (
    <>
      {canPreview && (
        <button
          type="button"
          title={t("agent:opfs_preview")}
          aria-label={t("agent:opfs_preview")}
          onClick={() => onPreview(entry)}
          className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Eye className="size-[15px]" />
        </button>
      )}
      {entry.kind === "file" && (
        <button
          type="button"
          title={t("common:download")}
          aria-label={t("common:download")}
          onClick={() => onDownload(entry)}
          className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Download className="size-[15px]" />
        </button>
      )}
      <Popconfirm
        description={t("agent:opfs_delete_confirm")}
        onConfirm={() => onDelete(entry)}
        destructive
        align="end"
      >
        <button
          type="button"
          data-testid={`delete-${entry.name}`}
          title={t("common:delete")}
          aria-label={t("common:delete")}
          className="flex size-[30px] items-center justify-center rounded-md text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Trash2 className="size-[15px]" />
        </button>
      </Popconfirm>
    </>
  );
}
