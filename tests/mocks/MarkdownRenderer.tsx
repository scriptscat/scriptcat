export default function MockMarkdownRenderer({ content }: { content: string }) {
  return <div data-testid="markdown-body">{content}</div>;
}
