import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { getDoc, listDocs } from "@/lib/docs";
import { Markdown } from "@/components/markdown";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export async function generateStaticParams() {
  const docs = await listDocs();
  return docs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description || undefined,
    alternates: { canonical: `/docs/${doc.slug}` },
    openGraph: {
      title: `${doc.title} · ${SITE.title}`,
      description: doc.description,
      url: `${SITE.url}/docs/${doc.slug}`,
      type: "article",
    },
  };
}

export default async function DocPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) notFound();

  const all = await listDocs();
  const idx = all.findIndex((d) => d.slug === slug);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: doc.title,
    description: doc.description,
    author: { "@type": "Organization", name: "AgentDM", url: SITE.agentdm },
    publisher: {
      "@type": "Organization",
      name: "AgentDM",
      url: SITE.agentdm,
    },
    mainEntityOfPage: `${SITE.url}/docs/${doc.slug}`,
    url: `${SITE.url}/docs/${doc.slug}`,
  };

  return (
    <article className="mx-auto max-w-4xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <nav className="mb-8 text-sm">
        <Link href="/docs" className="text-slate-400 hover:text-slate-200">
          ← All docs
        </Link>
      </nav>
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-slate-50">
          {doc.title}
        </h1>
        {doc.description && (
          <p className="mt-3 text-lg text-slate-400">{doc.description}</p>
        )}
      </header>

      <div className="mt-8">
        <Markdown source={doc.body} />
      </div>

      <div className="mt-16 border-t border-panel-700 pt-6 flex items-center justify-between text-sm">
        <a
          href={`${SITE.repo}/blob/main/docs/${doc.slug}.md`}
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200"
        >
          <ExternalLink className="h-4 w-4" />
          Edit on GitHub
        </a>
      </div>

      {(prev || next) && (
        <nav
          className="mt-10 grid gap-3 sm:grid-cols-2"
          aria-label="Pagination"
        >
          {prev ? (
            <Link
              href={prev.path}
              className="group flex items-center gap-3 rounded-lg border border-panel-700 bg-panel-800/40 px-4 py-3 hover:border-bolt-500/60 transition-colors"
            >
              <ChevronLeft className="h-5 w-5 text-slate-500 group-hover:text-bolt-400" />
              <div>
                <div className="text-xs text-slate-500">Previous</div>
                <div className="text-slate-100 font-medium">{prev.title}</div>
              </div>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={next.path}
              className="group flex items-center gap-3 justify-end rounded-lg border border-panel-700 bg-panel-800/40 px-4 py-3 hover:border-bolt-500/60 transition-colors sm:text-right"
            >
              <div>
                <div className="text-xs text-slate-500">Next</div>
                <div className="text-slate-100 font-medium">{next.title}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-bolt-400" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </article>
  );
}
