import { CreateScriptMenu } from "@App/pages/options/routes/ScriptList/CreateScriptMenu";

export default function MobileHeader() {
  return (
    <header className="flex items-center gap-3 h-[52px] px-4 shrink-0 bg-card border-b border-border">
      <img src={chrome.runtime.getURL("assets/logo.png")} alt="ScriptCat" className="w-7 h-7 shrink-0" />
      <span className="text-lg font-semibold text-foreground truncate">{"ScriptCat"}</span>
      <div className="flex-1" />
      <CreateScriptMenu variant="icon" />
    </header>
  );
}
