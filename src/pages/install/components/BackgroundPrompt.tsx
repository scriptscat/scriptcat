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
export const keepAlivePromptShownKey = "webrequest_blocking_prompt_shown";

type PromptPermission = "background" | "webRequestBlocking";

const promptConfig: Record<PromptPermission, { keyPrefix: string; shownKey: string }> = {
  background: {
    keyPrefix: "enable_background",
    shownKey: backgroundPromptShownKey,
  },
  webRequestBlocking: {
    keyPrefix: "keep_scripts_alive",
    shownKey: keepAlivePromptShownKey,
  },
};

export function BackgroundPrompt({
  open,
  scriptType,
  permission = "background",
  onResult,
}: {
  open: boolean;
  scriptType: string;
  permission?: PromptPermission;
  onResult: (enabled: boolean) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const config = promptConfig[permission];

  const enable = async () => {
    localStorage.setItem(config.shownKey, "true");
    const granted = await chrome.permissions.request({ permissions: [permission] }).catch(() => false);
    onResult(!!granted);
  };

  const later = () => {
    localStorage.setItem(config.shownKey, "true");
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
            {t(`settings:${config.keyPrefix}.prompt_title`)}
          </DialogTitle>
          <DialogDescription className="pt-1 text-left">
            {t(`settings:${config.keyPrefix}.prompt_description`, { scriptType })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t(`settings:${config.keyPrefix}.settings_hint`)}</p>
        <DialogFooter>
          <Button variant="outline" onClick={later}>
            {t(`settings:${config.keyPrefix}.maybe_later`)}
          </Button>
          <Button onClick={enable}>{t(`settings:${config.keyPrefix}.enable_now`)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
