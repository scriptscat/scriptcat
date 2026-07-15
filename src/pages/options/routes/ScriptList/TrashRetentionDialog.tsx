import { useState } from "react";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "@App/pages/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@App/pages/components/ui/dialog";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";

const OPTIONS = [7, 30, 90, 0] as const;

export function TrashRetentionDialog() {
  const { t } = useTranslation();
  const [retention = 30, setRetention] = useSystemConfig("trash_retention_days");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(retention);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(retention);
        setOpen(next);
      }}
    >
      <button
        type="button"
        onClick={() => {
          setDraft(retention);
          setOpen(true);
        }}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
      >
        <Settings2 className="size-3" />
        {t("settings")}
      </button>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[420px] gap-0 rounded-lg p-0">
        <DialogHeader className="gap-1.5 px-6 pb-4 pt-6 text-left">
          <DialogTitle>{t("settings:trash_retention")}</DialogTitle>
          <DialogDescription>{t("settings:trash_retention_desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 px-4 pb-4" role="radiogroup">
          {OPTIONS.map((value) => {
            const selected = draft === value;
            const label = t(value === 0 ? "settings:trash_retention_never" : `settings:trash_retention_${value}`);
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                onClick={() => setDraft(value)}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-lg border px-3 text-sm font-medium transition-colors",
                  selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    selected ? "border-primary" : "border-border"
                  )}
                >
                  {selected && <span className="size-2 rounded-full bg-primary" />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("editor:cancel")}
          </Button>
          <Button
            onClick={() => {
              setRetention(draft);
              setOpen(false);
            }}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
