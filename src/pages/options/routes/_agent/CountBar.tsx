import type { ReactNode } from "react";
import { Fragment } from "react";
import { cn } from "@App/pkg/utils/cn";

// 段着色语义：默认次要灰，其余沿用状态色
type SegmentTone = "default" | "success" | "warning" | "danger" | "primary";

const SEGMENT_TONES: Record<SegmentTone, string> = {
  default: "text-fg-secondary",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-destructive",
  primary: "text-primary",
};

export interface CountBarSegment {
  label: ReactNode;
  tone?: SegmentTone;
}

// Agent 列表页页头下方的计数摘要条：以 · 分隔的若干段；可整体替换为 children
export function CountBar({ segments, children }: { segments?: CountBarSegment[]; children?: ReactNode }) {
  return (
    <div data-testid="count-bar" className="flex h-5 items-center text-[13px] leading-none text-fg-secondary">
      {children ??
        segments?.map((seg, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <span data-testid="count-bar-sep" className="px-1.5 text-fg-secondary/60" aria-hidden>
                {"·"}
              </span>
            )}
            <span className={cn(SEGMENT_TONES[seg.tone ?? "default"])}>{seg.label}</span>
          </Fragment>
        ))}
    </div>
  );
}
