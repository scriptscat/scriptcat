import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Textarea } from "@App/pages/components/ui/textarea";

export function LinkImportDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (urls: string[]) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  // 关闭后清空,避免下次打开残留旧链接(取消/Esc/点遮罩仅触发 onOpenChange)
  // 在渲染期比较上一个 open 值再重置,等价于原 effect 但不触发级联渲染
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setText("");
  }
  const submit = () => {
    const urls = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
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
        <Textarea
          data-testid="link-import-textarea"
          className="h-36 resize-none font-mono text-xs"
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
