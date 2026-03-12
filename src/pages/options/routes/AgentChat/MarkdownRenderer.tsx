import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@arco-design/web-react";
import { IconCopy, IconCheck } from "@arco-design/web-react/icon";
import "highlight.js/styles/github.css";

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const language = className?.replace("hljs language-", "").replace("language-", "") || "";

  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
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

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="ai-markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const isInline = !className;
            const text = String(children).replace(/\n$/, "");
            if (isInline) {
              return (
                <code
                  className="tw-px-1.5 tw-py-0.5 tw-rounded tw-bg-[var(--color-fill-2)] tw-text-[rgb(var(--arcoblue-6))] tw-text-[0.9em]"
                  {...props}
                >
                  {text}
                </code>
              );
            }
            return <CodeBlock className={className}>{text}</CodeBlock>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
