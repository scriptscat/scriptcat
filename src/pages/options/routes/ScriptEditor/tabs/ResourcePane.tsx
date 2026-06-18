import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Resource } from "@App/app/repo/resource";
import { fetchScript, resourceClient } from "@App/pages/store/features/script";
import { t } from "@App/locales/locales";
import { base64ToBlob, formatBytes, makeBlobURL } from "@App/pkg/utils/utils";
import { Badge } from "@App/pages/components/ui/badge";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";

type ResItem = Resource & { key: string };

// 资源类型 -> 展示用的元数据标记
const TYPE_BADGE: Record<string, string> = {
  require: "@require",
  "require-css": "@require-css",
  resource: "@resource",
};

// 估算资源字节大小：优先用文本内容，其次用 base64 解码后的长度
function resourceByteSize(r: Resource): number {
  if (r.content) return new Blob([r.content]).size;
  if (r.base64) {
    const idx = r.base64.indexOf(",");
    const b64 = idx >= 0 ? r.base64.slice(idx + 1) : r.base64;
    const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
  }
  return 0;
}

function fileName(url: string): string {
  return url.split("/").pop() || url;
}

export interface ResourcePaneProps {
  uuid: string;
}

export default function ResourcePane({ uuid }: ResourcePaneProps) {
  const [list, setList] = useState<ResItem[]>([]);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchScript(uuid).then((script) => {
      if (!mounted || !script) return;
      resourceClient.getScriptResources(script).then((res) => {
        if (!mounted) return;
        setList(Object.keys(res).map((k) => ({ ...res[k], key: k })));
      });
    });
    return () => {
      mounted = false;
    };
  }, [uuid]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return kw ? list.filter((r) => r.key.toLowerCase().includes(kw)) : list;
  }, [list, keyword]);

  const onDelete = useCallback((url: string) => {
    resourceClient
      .deleteResource(url)
      .then(() => {
        setList((prev) => prev.filter((r) => r.key !== url));
        toast.success(t("delete_success"));
      })
      .catch((e) => toast.error(`${t("editor:delete_failed")}: ${e.message}`));
  }, []);

  const onClear = useCallback(() => {
    const urls = list.map((r) => r.key);
    Promise.all(urls.map((u) => resourceClient.deleteResource(u)))
      .then(() => {
        setList([]);
        toast.success(t("editor:clear_success"));
      })
      .catch((e) => toast.error(`${t("editor:delete_failed")}: ${e.message}`));
  }, [list]);

  const onDownload = useCallback((r: ResItem) => {
    const url = makeBlobURL({ blob: base64ToBlob(r.base64), persistence: false }) as string;
    chrome.downloads.download({ url, saveAs: true, filename: fileName(r.key) });
  }, []);

  const totalBytes = list.reduce((s, r) => s + resourceByteSize(r), 0);

  return (
    <div className="h-full overflow-y-auto scrollbar-custom px-8 py-5">
      <div className="flex flex-col gap-4">
        {/* 工具栏：搜索 + 计数 + 清空 */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("editor:search_resource")}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {t("editor:resource_count", { count: list.length, size: formatBytes(totalBytes) })}
          </span>
          <Popconfirm
            description={t("confirm_clear_resource")}
            destructive
            confirmText={t("confirm")}
            cancelText={t("editor:cancel")}
            onConfirm={onClear}
          >
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={list.length === 0}
            >
              <Trash2 className="size-3.5" />
              {t("clear")}
            </Button>
          </Popconfirm>
        </div>

        {/* 表格 */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 bg-background px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span className="min-w-0 flex-1">{t("editor:resource")}</span>
            <span className="w-52 shrink-0">{t("type")}</span>
            <span className="w-20 shrink-0">{t("size")}</span>
            <span className="w-16 shrink-0 text-right">{t("action")}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">{t("no_data")}</div>
          ) : (
            filtered.map((r) => (
              <div key={r.key} className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-xs">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-foreground" title={r.key}>
                    {fileName(r.key)}
                  </span>
                  <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                    {TYPE_BADGE[r.type] ?? r.type}
                  </Badge>
                </div>
                <span className="w-52 shrink-0 truncate font-mono text-muted-foreground" title={r.contentType}>
                  {r.contentType || "-"}
                </span>
                <span className="w-20 shrink-0 font-mono text-muted-foreground">
                  {formatBytes(resourceByteSize(r))}
                </span>
                <div className="flex w-16 shrink-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    aria-label={t("download")}
                    onClick={() => onDownload(r)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Download className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    onClick={() => onDelete(r.key)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
