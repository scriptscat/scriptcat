import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { memo, useRef, useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import "highlight.js/styles/github.css";

// Markdown 中的图片组件：支持点击全屏预览
function MarkdownImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [preview, setPreview] = useState(false);

  return (
    <>
      <span className="relative inline-block group cursor-pointer" onClick={() => setPreview(true)}>
        <img {...props} className="max-w-xs max-h-48 rounded border border-border object-contain" />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded flex items-center justify-center transition-colors">
          <Eye className="size-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      </span>
      {preview && (
        <span
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center cursor-pointer"
          onClick={() => setPreview(false)}
        >
          <img
            src={props.src}
            alt={props.alt}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </span>
      )}
    </>
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
