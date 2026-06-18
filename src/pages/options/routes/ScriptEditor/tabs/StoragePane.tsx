import { useCallback, useEffect, useMemo, useState } from "react";
import { Braces, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchScript, valueClient } from "@App/pages/store/features/script";
import { t } from "@App/locales/locales";
import { valueType } from "@App/pkg/utils/utils";
import { encodeRValue, type TKeyValuePair } from "@App/pkg/utils/message_value";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Textarea } from "@App/pages/components/ui/textarea";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@App/pages/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";

type Row = { key: string; value: unknown };
type ValType = "string" | "number" | "boolean" | "object";
const TYPES: ValType[] = ["string", "number", "boolean", "object"];

function displayValue(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

// 储存值类型徽章配色（令牌定义于 src/index.css，随明暗主题自动切换）
const TYPE_BADGE_CLASS: Record<ValType, string> = {
  string: "bg-type-string-bg text-type-string-fg",
  number: "bg-type-number-bg text-type-number-fg",
  boolean: "bg-type-boolean-bg text-type-boolean-fg",
  object: "bg-type-object-bg text-type-object-fg",
};

function TypeBadge({ value }: { value: unknown }) {
  const vt = valueType(value);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px]",
        TYPE_BADGE_CLASS[vt as ValType] ?? "bg-secondary text-secondary-foreground"
      )}
    >
      {vt}
    </span>
  );
}

interface DialogState {
  isNew: boolean;
  key: string;
  valueStr: string;
  type: ValType;
}

export interface StoragePaneProps {
  uuid: string;
}

export default function StoragePane({ uuid }: StoragePaneProps) {
  const [data, setData] = useState<Row[]>([]);
  const [keyword, setKeyword] = useState("");
  const [batch, setBatch] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchScript(uuid).then((script) => {
      if (!mounted || !script) return;
      valueClient.getScriptValue(script).then((rec) => {
        if (!mounted) return;
        setData(Object.keys(rec).map((k) => ({ key: k, value: rec[k] })));
      });
    });
    return () => {
      mounted = false;
    };
  }, [uuid]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return kw ? data.filter((r) => r.key.toLowerCase().includes(kw)) : data;
  }, [data, keyword]);

  const openAdd = () => setDialog({ isNew: true, key: "", valueStr: "", type: "string" });
  const openEdit = (r: Row) => {
    const vt = valueType(r.value);
    const type: ValType = TYPES.includes(vt as ValType) ? (vt as ValType) : "string";
    setDialog({ isNew: false, key: r.key, valueStr: displayValue(r.value), type });
  };

  const saveDialog = () => {
    if (!dialog) return;
    let value: unknown;
    try {
      switch (dialog.type) {
        case "number":
          value = Number(dialog.valueStr);
          break;
        case "boolean":
          value = dialog.valueStr === "true";
          break;
        case "object":
          value = JSON.parse(dialog.valueStr);
          break;
        default:
          value = dialog.valueStr;
      }
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    valueClient.setScriptValue({ uuid, key: dialog.key, value, ts: Date.now() });
    setData((prev) => {
      const idx = prev.findIndex((r) => r.key === dialog.key);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { key: dialog.key, value };
        return next;
      }
      return [...prev, { key: dialog.key, value }];
    });
    toast.success(dialog.isNew ? t("add_success") : t("update_success"));
    setDialog(null);
  };

  const onDelete = useCallback(
    (key: string) => {
      valueClient.setScriptValue({ uuid, key, value: undefined, ts: Date.now() });
      setData((prev) => prev.filter((r) => r.key !== key));
      toast.success(t("delete_success"));
    },
    [uuid]
  );

  const onClear = useCallback(() => {
    valueClient.setScriptValues({ uuid, keyValuePairs: [], isReplace: true, ts: Date.now() });
    setData([]);
    toast.success(t("editor:clear_success"));
  }, [uuid]);

  const enterBatch = () => {
    const rec: { [k: string]: unknown } = {};
    for (const r of data) rec[r.key] = r.value;
    setBatchText(JSON.stringify(rec, null, 2));
    setBatch(true);
  };

  const saveBatch = () => {
    let rec: { [k: string]: unknown };
    try {
      rec = JSON.parse(batchText);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const keyValuePairs = Object.keys(rec).map((k) => [k, encodeRValue(rec[k])]) as TKeyValuePair[];
    valueClient.setScriptValues({ uuid, keyValuePairs, isReplace: true, ts: Date.now() });
    setData(Object.keys(rec).map((k) => ({ key: k, value: rec[k] })));
    setBatch(false);
    toast.success(t("save_success"));
  };

  if (batch) {
    return (
      <div className="h-full overflow-hidden p-6">
        <div className="mx-auto flex h-full max-w-3xl flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{t("editor:script_storage")}</span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setBatch(false)}>
              {t("editor:individual_edit")}
            </Button>
            <Button size="sm" onClick={saveBatch}>
              {t("save")}
            </Button>
          </div>
          <Textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            className="min-h-0 flex-1 font-mono text-xs"
            spellCheck={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-custom px-8 py-5">
      <div className="flex flex-col gap-4">
        {/* 工具栏：搜索 + 计数 + 批量编辑 + 添加 + 清空 */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("editor:search_storage")}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">{t("editor:record_count", { count: data.length })}</span>
          <Button size="sm" variant="outline" onClick={enterBatch} disabled={data.length === 0}>
            <Braces className="size-3.5" />
            {t("editor:batch_edit")}
          </Button>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="size-3.5" />
            {t("add")}
          </Button>
          <Popconfirm
            description={t("editor:confirm_clear")}
            destructive
            confirmText={t("confirm")}
            cancelText={t("editor:cancel")}
            onConfirm={onClear}
          >
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={data.length === 0}
            >
              <Trash2 className="size-3.5" />
              {t("clear")}
            </Button>
          </Popconfirm>
        </div>

        {/* 表格 */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 bg-background px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span className="w-44 shrink-0">{t("key")}</span>
            <span className="min-w-0 flex-1">{t("value")}</span>
            <span className="w-20 shrink-0">{t("type")}</span>
            <span className="w-16 shrink-0 text-right">{t("action")}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">{t("no_data")}</div>
          ) : (
            filtered.map((r) => (
              <div key={r.key} className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-xs">
                <span className="w-44 shrink-0 truncate font-mono text-foreground" title={r.key}>
                  {r.key}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={displayValue(r.value)}>
                  {displayValue(r.value)}
                </span>
                <span className="w-20 shrink-0">
                  <TypeBadge value={r.value} />
                </span>
                <div className="flex w-16 shrink-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    aria-label={t("edit")}
                    onClick={() => openEdit(r)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
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

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.isNew ? t("add_value") : t("edit_value")}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="flex flex-col gap-3">
              <Input
                value={dialog.key}
                disabled={!dialog.isNew}
                onChange={(e) => setDialog({ ...dialog, key: e.target.value })}
                placeholder={t("editor:key_placeholder")}
              />
              <Select value={dialog.type} onValueChange={(v) => setDialog({ ...dialog, type: v as ValType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      {t(`type_${tp}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={dialog.valueStr}
                onChange={(e) => setDialog({ ...dialog, valueStr: e.target.value })}
                placeholder={t("editor:value_placeholder")}
                rows={5}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t("editor:cancel")}
            </Button>
            <Button onClick={saveDialog}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
