import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ImgHTMLAttributes, ReactNode } from "react";
import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@arco-design/web-react";
import { IconCopy, IconCheck, IconEye } from "@arco-design/web-react/icon";
import "highlight.js/styles/github.css";

// Markdown 中的图片组件：支持点击预览
function MarkdownImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [preview, setPreview] = useState(false);

  return (
    <>
      <span className="tw-relative tw-inline-block tw-group tw-cursor-pointer" onClick={() => setPreview(true)}>
        <img
          {...props}
          className="tw-max-w-xs tw-max-h-48 tw-rounded tw-border tw-border-solid tw-border-[var(--color-border-1)] tw-object-contain"
        />
        <span className="tw-absolute tw-inset-0 tw-bg-black/0 group-hover:tw-bg-black/20 tw-rounded tw-flex tw-items-center tw-justify-center tw-transition-colors">
          <IconEye
            className="tw-text-white tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity"
            style={{ fontSize: 20 }}
          />
        </span>
      </span>
      {preview && (
        <span
          className="tw-fixed tw-inset-0 tw-z-[1000] tw-bg-black/80 tw-flex tw-items-center tw-justify-center tw-cursor-pointer"
          onClick={() => setPreview(false)}
        >
          <img
            src={props.src}
            alt={props.alt}
            className="tw-max-w-[90vw] tw-max-h-[90vh] tw-object-contain"
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
    return extractText(node.props.children);
  }
  return "";
}

function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const language = className?.replace("hljs language-", "").replace("language-", "") || "";

  const handleCopy = () => {
    navigator.clipboard.writeText(extractText(children)).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="tw-relative tw-group tw-my-3">
      <div className="tw-flex tw-items-center tw-justify-between tw-px-4 tw-py-1.5 tw-bg-[var(--color-fill-3)] tw-rounded-t-lg tw-text-xs tw-text-[var(--color-text-3)]">
        <span className="tw-font-medium">{language}</span>
        <Tooltip content={copied ? t("agent_chat_copy_success") : t("agent_chat_copy")}>
          <button
            onClick={handleCopy}
            className="tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-0.5 tw-rounded tw-border-none tw-bg-transparent tw-text-[var(--color-text-3)] tw-cursor-pointer hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors tw-text-xs"
          >
            {copied ? <IconCheck style={{ fontSize: 12 }} /> : <IconCopy style={{ fontSize: 12 }} />}
          </button>
        </Tooltip>
      </div>
      <pre className="!tw-mt-0 !tw-rounded-t-none !tw-rounded-b-lg !tw-bg-[var(--color-fill-2)]">
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
                <code
                  className="tw-px-1.5 tw-py-0.5 tw-rounded tw-bg-[var(--color-fill-2)] tw-text-[rgb(var(--arcoblue-6))] tw-text-[0.9em]"
                  {...props}
                >
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
