import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const PLACEHOLDER_ORIGIN = "https://local.invalid";
const MARKDOWN_CONTENT_CLASS = "markdown-content";

function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const transformed = defaultUrlTransform(value);
  if (!transformed) return undefined;
  if (transformed.startsWith("#")) return transformed;
  if (transformed.startsWith("/")) return transformed;

  try {
    const url = new URL(transformed, PLACEHOLDER_ORIGIN);
    if (url.origin === PLACEHOLDER_ORIGIN) return `${url.pathname}${url.search}${url.hash}`;
    if (SAFE_PROTOCOLS.has(url.protocol)) return transformed;
  } catch {
    return undefined;
  }

  return undefined;
}

export interface SafeMarkdownProps {
  markdown: string;
  className?: string;
}

export function SafeMarkdown({ markdown, className }: SafeMarkdownProps) {
  const content = (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ children, href, ...props }) {
          const { node, ...anchorProps } = props;
          void node;
          const safe = safeHref(href);
          if (!safe) return <>{children}</>;
          return (
            <a {...anchorProps} href={safe} rel="nofollow ugc noreferrer">
              {children}
            </a>
          );
        },
        img({ alt }) {
          return <span>{alt ?? ""}</span>;
        },
      }}
    >
      {markdown}
    </Markdown>
  );

  return <div className={className ? `${MARKDOWN_CONTENT_CLASS} ${className}` : MARKDOWN_CONTENT_CLASS}>{content}</div>;
}