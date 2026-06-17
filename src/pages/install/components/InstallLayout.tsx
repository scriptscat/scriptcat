export interface InstallLayoutProps {
  /** 顶部右侧上下文标题(如「脚本安装」「脚本更新」),由调用方按场景翻译 */
  title: string;
  /** 吸底操作栏内容 */
  actions: React.ReactNode;
  children: React.ReactNode;
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        {"S"}
      </div>
      <span className="text-[15px] font-semibold text-foreground">{"ScriptCat"}</span>
    </div>
  );
}

export function InstallLayout({ title, actions, children }: InstallLayoutProps) {
  return (
    <div data-testid="install-layout" className="flex h-screen flex-col bg-background">
      <header
        data-testid="top-bar"
        className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-card/95 px-6 backdrop-blur"
      >
        <BrandMark />
        <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {title}
        </span>
      </header>

      <main data-testid="content-area" className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto flex w-full max-w-[864px] flex-col gap-4">{children}</div>
      </main>

      <footer
        data-testid="action-bar"
        className="sticky bottom-0 z-10 flex min-h-[68px] shrink-0 items-center border-t border-border bg-card/95 px-6 py-3 backdrop-blur"
      >
        <div className="mx-auto w-full max-w-[864px]">{actions}</div>
      </footer>
    </div>
  );
}
