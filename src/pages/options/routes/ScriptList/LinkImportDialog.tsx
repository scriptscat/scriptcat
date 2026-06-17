import { useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@App/pages/components/ui/dialog";
import { Button } from "@App/pages/components/ui/button";
import { t } from "@App/locales/locales";

export function LinkImportDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (urls: string[]) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const urls = text.split("\n").map((s) => s.trim()).filter(Boolean);
    if (urls.length) onSubmit(urls);
    onOpenChange(false);
    setText("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("script:link_import")}</DialogTitle>
          <DialogDescription>{t("script:link_import_desc")}</DialogDescription>
        </DialogHeader>
        <textarea
          data-testid="link-import-textarea"
          className="h-36 w-full resize-none rounded-md border border-input bg-muted/40 p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder={t("script:link_import_placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="text-xs text-muted-foreground">{t("script:link_import_hint")}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button data-testid="link-import-submit" onClick={submit}>
            <Download className="size-4" />
            {t("import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
