import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-teamfuse max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          // Resolve relative links inside the docs ("[x](docs/foo.md)" or
          // "../sop/bar.md") to the right public path on the site.
          a({ href, children, ...rest }) {
            const resolved = resolveLink(href);
            const external = /^https?:\/\//.test(resolved);
            return (
              <a
                href={resolved}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                {...rest}
              >
                {children}
              </a>
            );
          },
          img({ src, alt, ...rest }) {
            const resolved = resolveAsset(src);
            return <img src={resolved} alt={alt} {...rest} />;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

function resolveLink(href: string | undefined): string {
  if (!href) return "#";
  if (/^https?:\/\//.test(href) || href.startsWith("mailto:") || href.startsWith("#")) {
    return href;
  }
  // Incoming paths like "docs/streaming-agent-loop.md", "../docs/foo.md",
  // "agents/sop/pr-review-protocol.md". Normalise to site routes when
  // possible; fall back to GitHub otherwise.
  const clean = href.replace(/^\.\.?\//, "").replace(/\/+/g, "/");
  const docMatch = clean.match(/(?:^|\/)docs\/([^/]+?)\.md$/);
  if (docMatch) return `/docs/${docMatch[1]}`;
  if (clean.endsWith(".md")) {
    return `https://github.com/agentdmai/teamfuse/blob/main/${clean}`;
  }
  if (clean.startsWith("agents/") || clean.startsWith("agents-web/")) {
    return `https://github.com/agentdmai/teamfuse/tree/main/${clean}`;
  }
  return href;
}

function resolveAsset(src: string | undefined): string {
  if (!src) return "";
  if (/^https?:\/\//.test(src) || src.startsWith("/")) return src;
  // docs/screenshots/control-panel.svg, docs/logo.svg etc.
  const clean = src.replace(/^\.\.?\//, "");
  if (clean.startsWith("docs/screenshots/")) {
    return "/" + clean.replace(/^docs\//, "");
  }
  if (clean === "docs/logo.svg" || clean === "logo.svg") return "/logo.svg";
  return "/" + clean;
}
