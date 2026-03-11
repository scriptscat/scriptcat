import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Tooltip } from "@arco-design/web-react";
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
    <div className="tw-relative tw-group">
      <div className="tw-flex tw-items-center tw-justify-between tw-px-4 tw-py-1.5 tw-bg-[var(--color-fill-2)] tw-rounded-t-lg tw-text-xs tw-text-[var(--color-text-3)]">
        <span>{language}</span>
        <Tooltip content={copied ? t("agent_chat_copy_success") : t("agent_chat_copy")}>
          <Button type="text" size="mini" icon={copied ? <IconCheck /> : <IconCopy />} onClick={handleCopy} />
        </Tooltip>
      </div>
      <pre className="!tw-mt-0 !tw-rounded-t-none">
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
                <code className="tw-px-1.5 tw-py-0.5 tw-rounded tw-bg-[var(--color-fill-2)] tw-text-sm" {...props}>
                  {text}
                </code>
              );
            }
            return <CodeBlock className={className}>{text}</CodeBlock>;
          },
          table({ children }) {
            return (
              <div className="tw-overflow-x-auto tw-my-2">
                <table className="tw-border-collapse tw-w-full tw-text-sm">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-px-3 tw-py-2 tw-bg-[var(--color-fill-1)] tw-text-left tw-font-medium">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-px-3 tw-py-2">
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
