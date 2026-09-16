import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ExternalLink } from "lucide-react";
import { DocumentationSite } from "@App/app/const";
import { localePath } from "@App/locales/locales";
import { Popover, PopoverAnchor, PopoverContent } from "@App/pages/components/ui/popover";
import { useHoverMenu } from "@App/pages/components/ui/use-hover-menu";

export type CompatChipKind = "metadata" | "value" | "grant";

// 同一时刻只开一枚浮层：标记 chip 常常并排，浮层有 288px 宽，两枚同时开会互相盖住。
// 悬停切换时旧浮层要等关闭延迟才收，靠这里立刻收掉。
let closeActivePopover: (() => void) | null = null;

const DOC_PATH: Record<CompatChipKind, string> = {
  metadata: "/docs/dev/meta",
  value: "/docs/dev/meta",
  grant: "/docs/dev/api",
};

const DESC_KEY: Record<CompatChipKind, string> = {
  metadata: "install:compat_tag_desc",
  value: "install:compat_value_desc",
  grant: "install:compat_grant_desc",
};

/**
 * 写了但不会生效的指令 / GM 能力。就近标在它所属的权限行上,不单独成卡。
 * 说明走浮层(hover 与键盘聚焦都能开),点击本体跳到代码对应行——
 * 点击恒为跳转,不做浮层开关,否则「点一下跳过去」这个主动作会被折叠状态吃掉。
 */
export function CompatChip({
  label,
  kind,
  line,
  onJump,
}: {
  label: string;
  kind: CompatChipKind;
  line?: number;
  onJump?: (line: number) => void;
}) {
  const { t } = useTranslation(["install", "common"]);
  // 浮层里有文档链接，必须把浮层本体也纳入悬停范围：只盯 chip 的话鼠标一移向链接浮层就关了
  const { rootProps, hoverProps, contentProps, close } = useHoverMenu(150);
  const canJump = line !== undefined && !!onJump;
  // close 来自 useHoverMenu 的 useCallback([])，恒定，故清理只在卸载时发生
  useEffect(
    () => () => {
      if (closeActivePopover === close) closeActivePopover = null;
    },
    [close]
  );

  const openPopover = () => {
    if (closeActivePopover && closeActivePopover !== close) closeActivePopover();
    closeActivePopover = close;
    hoverProps.onMouseEnter();
  };

  return (
    <Popover {...rootProps}>
      <PopoverAnchor asChild>
        <button
          type="button"
          data-testid="compat-chip"
          data-line={line}
          aria-label={`${label} · ${t("install:compat_ineffective")}`}
          {...hoverProps}
          onMouseEnter={openPopover}
          onFocus={openPopover}
          onBlur={hoverProps.onMouseLeave}
          onClick={() => canJump && onJump(line)}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-dashed border-warning-fg bg-warning-bg px-2 py-0.5 font-mono text-xs text-warning-fg hover:bg-warning-bg/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Ban className="size-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-all">{label}</span>
        </button>
      </PopoverAnchor>
      <PopoverContent {...contentProps} data-testid="compat-popover" side="top" align="start" className="w-72 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Ban className="size-3.5 shrink-0 text-warning-fg" aria-hidden="true" />
          <span className="font-mono">{label}</span>
          <span className="text-warning-fg">{t("install:compat_ineffective")}</span>
        </p>
        <p className="mt-1 text-[13px] text-fg-secondary">{t(DESC_KEY[kind])}</p>
        <div className="mt-2.5 flex items-center gap-2">
          {canJump && (
            <span className="rounded-md bg-primary-light px-2 py-0.5 text-[11px] font-medium text-primary">
              {t("install:compat_jump", { line })}
            </span>
          )}
          <a
            data-testid="compat-docs"
            href={`${DocumentationSite}${localePath}${DOC_PATH[kind]}`}
            target="_blank"
            rel="noreferrer"
            onClick={close}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
          >
            {t("install:compat_docs")}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 在脚本猫里生效、换到别的脚本管理器就不生效的指令或 API */
export function ScriptCatOnlyBadge() {
  const { t } = useTranslation(["install", "common"]);
  return (
    <span
      data-testid="scriptcat-only"
      className="shrink-0 rounded bg-primary-light px-1 font-sans text-[10px] font-medium text-primary"
    >
      {t("install:compat_scriptcat_only")}
    </span>
  );
}
