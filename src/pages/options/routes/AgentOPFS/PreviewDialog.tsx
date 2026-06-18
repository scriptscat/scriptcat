import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@App/pages/components/ui/dialog";
import type { FileKind } from "./opfs_fs";

export function PreviewDialog({
  open,
  name,
  kind,
  text,
  imageUrl,
  onOpenChange,
}: {
  open: boolean;
  name: string;
  kind: FileKind;
  text?: string;
  imageUrl?: string;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation(["agent"]);
  const display = useMemo(() => {
    if (kind === "json" && text != null) {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text; // 非法 JSON 时原样展示
      }
    }
    return text ?? "";
  }, [kind, text]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate text-sm">
            <span className="text-foreground">{`${t("agent:opfs_preview")} — `}</span>
            <span className="font-mono">{name}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">{name}</DialogDescription>
        </DialogHeader>
        {kind === "img" && imageUrl ? (
          <img src={imageUrl} alt={name} className="mx-auto max-h-[70vh] rounded-md object-contain" />
        ) : (
          <pre
            data-testid="preview-content"
            className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs text-foreground"
          >
            {display}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
