import { useTranslation } from "react-i18next";
import { Rocket } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@App/pages/components/ui/dialog";

export const backgroundPromptShownKey = "background_prompt_shown";

export function BackgroundPrompt({
  open,
  scriptType,
  onResult,
}: {
  open: boolean;
  scriptType: string;
  onResult: (enabled: boolean) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);

  const enable = async () => {
    localStorage.setItem(backgroundPromptShownKey, "true");
    const granted = await chrome.permissions.request({ permissions: ["background"] }).catch(() => false);
    onResult(!!granted);
  };

  const later = () => {
    localStorage.setItem(backgroundPromptShownKey, "true");
    onResult(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) later();
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-light">
              <Rocket className="size-[18px] text-primary" />
            </span>
            {t("settings:enable_background.prompt_title")}
          </DialogTitle>
          <DialogDescription className="pt-1 text-left">
            {t("settings:enable_background.prompt_description", { scriptType })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("settings:enable_background.settings_hint")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={later}>
            {t("settings:enable_background.maybe_later")}
          </Button>
          <Button onClick={enable}>{t("settings:enable_background.enable_now")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
