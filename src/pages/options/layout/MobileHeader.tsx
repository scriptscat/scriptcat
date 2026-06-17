import { useState } from "react";
import { Menu } from "lucide-react";
import { CreateScriptMenu } from "@App/pages/options/routes/ScriptList/CreateScriptMenu";
import { Sheet, SheetContent, SheetTitle } from "@App/pages/components/ui/sheet";
import { t } from "@App/locales/locales";
import MobileNavDrawer from "./MobileNavDrawer";

export default function MobileHeader() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <header className="flex items-center gap-3 h-[52px] px-4 shrink-0 bg-card border-b border-border">
      <button
        type="button"
        aria-label={t("menu")}
        onClick={() => setNavOpen(true)}
        className="size-9 -ml-1.5 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Menu className="size-5" />
      </button>
      <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="w-7 h-7 shrink-0" />
      <span className="text-lg font-semibold text-foreground truncate">{"ScriptCat"}</span>
      <div className="flex-1" />
      <CreateScriptMenu variant="icon" />

      {/* 左侧导航抽屉:镜像桌面 Sidebar,补齐移动端 Agent 等板块的入口 */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="w-[280px] p-0 gap-0 bg-sidebar [&>button]:hidden"
        >
          <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
          <MobileNavDrawer onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
