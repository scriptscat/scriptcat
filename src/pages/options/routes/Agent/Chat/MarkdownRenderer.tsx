import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { ImagePreview } from "./ImagePreview";
import "highlight.js/styles/github.css";

// Markdown 中的图片组件：支持点击全屏预览
function MarkdownImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  if (!props.src) {
    return <img {...props} className="max-h-48 max-w-xs rounded border border-border object-contain" />;
  }

  return (
    <ImagePreview src={props.src} alt={props.alt}>
      <img {...props} className="max-h-48 max-w-xs rounded border border-border object-contain" />
    </ImagePreview>
  );
}

// 自定义 URL 转换：允许 data:image/ 开头的 base64 图片 URL（模型生成的图片）
function urlTransform(url: string): string {
  if (url.startsWith("data:image/")) return url;
  return defaultUrlTransform(url);
}

// 从 React 节点树中递归提取纯文本，用于复制功能
function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const language = className?.replace("hljs language-", "").replace("language-", "") || "";

  const handleCopy = () => {
    navigator.clipboard.writeText(extractText(children)).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between px-4 py-1.5 bg-muted rounded-t-lg text-xs text-muted-foreground">
        <span className="font-medium">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? t("agent:chat_copy_success") : t("agent:chat_copy")}
          aria-label={copied ? t("agent:chat_copy_success") : t("agent:chat_copy")}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-transparent text-muted-foreground cursor-pointer hover:text-foreground hover:bg-accent transition-colors text-xs"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none !rounded-b-lg !bg-muted/60">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="ai-markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={urlTransform}
        components={{
          img(props) {
            return <MarkdownImage {...props} />;
          },
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className={cn("px-1.5 py-0.5 rounded bg-muted text-primary text-[0.9em]")} {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
