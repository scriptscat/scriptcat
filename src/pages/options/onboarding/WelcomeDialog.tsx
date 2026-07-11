import { useTranslation } from "react-i18next";
import { Blocks, Store, CloudUpload, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@App/pages/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@App/pages/components/ui/sheet";
import { Button } from "@App/pages/components/ui/button";
import { useOnboarding } from "./OnboardingProvider";

type FeatureItem = [typeof Blocks, string, string];

interface WelcomeBodyProps {
  titleSlot: React.ReactNode;
  subtitleSlot: React.ReactNode;
}

function WelcomeBody({ titleSlot, subtitleSlot }: WelcomeBodyProps) {
  const { t } = useTranslation();
  const { startTour, skip } = useOnboarding();
  const features: FeatureItem[] = [
    [Blocks, t("guide:welcome_feature_manage_title"), t("guide:welcome_feature_manage_desc")],
    [Store, t("guide:welcome_feature_market_title"), t("guide:welcome_feature_market_desc")],
    [CloudUpload, t("guide:welcome_feature_backup_title"), t("guide:welcome_feature_backup_desc")],
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="h-14 w-14 shrink-0" />
        {titleSlot}
        {subtitleSlot}
      </div>
      <div className="flex flex-col gap-3">
        {features.map(([Icon, title, desc]) => (
          <div key={title} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
              <Icon className="h-[18px] w-[18px] text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{title}</span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={skip}>
          {t("guide:welcome_later")}
        </Button>
        <Button onClick={startTour} className="gap-1.5">
          {t("guide:welcome_start")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function WelcomeDialog() {
  const { t } = useTranslation();
  const { mode, skip } = useOnboarding();

  if (mode === "mobile") {
    return (
      <Sheet open onOpenChange={(o) => !o && skip()}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <WelcomeBody
            titleSlot={
              <SheetTitle className="text-xl font-bold text-foreground">{t("guide:welcome_title")}</SheetTitle>
            }
            subtitleSlot={
              <SheetDescription className="max-w-[320px] text-sm text-muted-foreground">
                {t("guide:welcome_subtitle")}
              </SheetDescription>
            }
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && skip()}>
      <DialogContent className="max-w-[460px]">
        <WelcomeBody
          titleSlot={
            <DialogTitle className="text-xl font-bold text-foreground">{t("guide:welcome_title")}</DialogTitle>
          }
          subtitleSlot={
            <DialogDescription className="max-w-[320px] text-sm text-muted-foreground">
              {t("guide:welcome_subtitle")}
            </DialogDescription>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
