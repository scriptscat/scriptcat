import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  HardDrive,
  Folder,
  File,
  FileJson,
  FileText,
  Image as ImageIcon,
  ChevronRight,
  Eye,
  Download,
  Trash2,
} from "lucide-react";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { cn } from "@App/pkg/utils/cn";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { AgentEmptyState } from "../_agent/AgentEmptyState";
import { PreviewDialog } from "./PreviewDialog";
import { listDir, removeEntry, readFileText, getFileBlob, formatSize, fileKind, type FileEntry, type FileKind } from "./opfs_fs";

type PreviewState = { open: boolean; name: string; kind: FileKind; text?: string; imageUrl?: string };

function entryIcon(entry: FileEntry) {
  if (entry.kind === "directory") return Folder;
  switch (fileKind(entry.name)) {
    case "json":
      return FileJson;
    case "img":
      return ImageIcon;
    case "md":
    case "text":
      return FileText;
    default:
      return File;
  }
}

const PREVIEWABLE: FileKind[] = ["json", "md", "text", "img"];

export default function AgentOPFS() {
  const { t } = useTranslation(["agent", "common"]);
  const isMobile = useIsMobile();
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    navigator.storage.getDirectory().then(setRoot);
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
    load();
  }, [load]);

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
    toast.success(t("agent:opfs_delete_success"));
    await load();
  };

  const closePreview = () => {
    if (preview?.imageUrl) URL.revokeObjectURL(preview.imageUrl);
    setPreview(null);
  };

  const crumbs = [t("agent:opfs_root"), ...path];

  return (
    <div className="flex h-full flex-col">
      <AgentPageHeader icon={HardDrive} title={t("agent:opfs_title")} subtitle="OPFS" />

      {/* 面包屑 */}
      <div className="flex items-center gap-1 border-b border-border bg-card px-6 py-2 text-sm">
        {crumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
            <button
              type="button"
              data-testid={`crumb-${i}`}
              onClick={() => setPath(path.slice(0, i))}
              className={cn(
                "rounded px-1.5 py-0.5 hover:bg-accent",
                i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!loading && entries.length === 0 ? (
          <AgentEmptyState icon={Folder} title={t("agent:opfs_empty")} description={t("agent:opfs_title")} />
        ) : isMobile ? (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const Icon = entryIcon(entry);
              return (
                <div key={entry.name} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    data-testid={`entry-${entry.name}`}
                    onClick={() => openEntry(entry)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                  >
                    {entry.name}
                  </button>
                  {entry.kind === "file" && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entry.size != null ? formatSize(entry.size) : "—"}
                    </span>
                  )}
                  <RowActions entry={entry} onPreview={openEntry} onDownload={handleDownload} onDelete={handleDelete} t={t} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span className="flex-1">{t("agent:opfs_name")}</span>
              <span className="w-24">{t("agent:opfs_type")}</span>
              <span className="w-24 text-right">{t("agent:opfs_size")}</span>
              <span className="w-40">{t("agent:opfs_modified")}</span>
              <span className="w-28 text-right" />
            </div>
            {entries.map((entry) => {
              const Icon = entryIcon(entry);
              return (
                <div
                  key={entry.name}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0 hover:bg-accent/40"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      data-testid={`entry-${entry.name}`}
                      onClick={() => openEntry(entry)}
                      className="truncate text-left text-foreground hover:underline"
                    >
                      {entry.name}
                    </button>
                  </div>
                  <span className="w-24 text-xs text-muted-foreground">
                    {entry.kind === "directory" ? t("agent:opfs_directory") : t("agent:opfs_file")}
                  </span>
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {entry.size != null ? formatSize(entry.size) : "—"}
                  </span>
                  <span className="w-40 font-mono text-xs text-muted-foreground">
                    {entry.lastModified ? formatUnixTime(Math.floor(entry.lastModified / 1000)) : "—"}
                  </span>
                  <div className="flex w-28 justify-end">
                    <RowActions entry={entry} onPreview={openEntry} onDownload={handleDownload} onDelete={handleDelete} t={t} />
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
    <div className="flex shrink-0 items-center gap-0.5">
      {canPreview && (
        <button
          type="button"
          title={t("agent:opfs_preview")}
          onClick={() => onPreview(entry)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Eye className="size-4" />
        </button>
      )}
      {entry.kind === "file" && (
        <button
          type="button"
          title="Download"
          onClick={() => onDownload(entry)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Download className="size-4" />
        </button>
      )}
      <Popconfirm description={t("agent:opfs_delete_confirm")} onConfirm={() => onDelete(entry)} destructive align="end">
        <button
          type="button"
          data-testid={`delete-${entry.name}`}
          title={t("common:delete")}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </Popconfirm>
    </div>
  );
}
