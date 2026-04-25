import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SITE } from "@/lib/site";

export type Crumb = {
  /** Visible label */
  name: string;
  /** Site-relative path (e.g. "/docs"). Omit on the current page. */
  href?: string;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: `${SITE.url}${c.href}` } : {}),
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-slate-400">
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${c.name}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 text-slate-600"
                  aria-hidden
                />
              )}
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  className="hover:text-slate-200 transition-colors"
                >
                  {c.name}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "text-slate-200" : ""}
                >
                  {c.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
