import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Dialog, DialogContent, DialogTitle } from "@App/pages/components/ui/dialog";

// 点击全屏预览的图片容器：缩略图上悬浮 Eye 图标，点击在 Dialog 中放大。
// 会话附件图片与 Markdown 图片共用此组件，避免各自重复实现预览逻辑。
export function ImagePreview({
  src,
  alt,
  className,
  children,
}: {
  src: string;
  alt?: string;
  className?: string;
  children: ReactNode;
}) {
  const title = alt || "Image preview";
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={title}
        onClick={() => setOpen(true)}
        className={cn("group relative inline-flex cursor-pointer border-none bg-transparent p-0", className)}
      >
        {children}
        <span className="absolute inset-0 flex items-center justify-center rounded bg-overlay/0 transition-colors group-hover:bg-overlay/20">
          <Eye className="size-5 text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </button>
      <DialogContent className="max-w-[calc(100vw-2rem)] border-none bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-2rem)]">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-md object-contain" />
      </DialogContent>
    </Dialog>
  );
}
