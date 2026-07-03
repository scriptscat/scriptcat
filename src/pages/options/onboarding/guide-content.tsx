import type { ReactNode } from "react";

/** 把含 `<Link href="URL">text</Link>` 的引导文案渲染为可点链接 */
export function renderGuideContent(text: string): ReactNode[] {
  const re = /<Link href="([^"]+)">(.*?)<\/Link>/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <a
        key={`l${key++}`}
        href={m[1]}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {m[2]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
