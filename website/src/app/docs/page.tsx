import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { listDocs } from "@/lib/docs";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Full documentation for teamfuse: architecture, the streaming agent loop, AgentDM integration, board integration, creating agents, operator guide, and extending.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: `Docs · ${SITE.title}`,
    description: "Full teamfuse documentation.",
    url: `${SITE.url}/docs`,
    type: "website",
  },
};

export default async function DocsIndex() {
  const docs = await listDocs();
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <BookOpen className="h-4 w-4" />
        <span>Documentation</span>
      </div>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-50">
        teamfuse docs
      </h1>
      <p className="mt-4 text-lg text-slate-300">
        Everything you need to stand up a team of Claude Code agents, wire
        them into a real messaging layer, and run them from a local
        dashboard. Every page is generated from the markdown in the repo,
        so it stays in sync with the code.
      </p>

      <ul className="mt-12 grid gap-4">
        {docs.map((d) => (
          <li key={d.slug}>
            <Link
              href={d.path}
              className="group flex items-start gap-4 rounded-xl border border-panel-700 bg-panel-800/40 p-6 hover:border-bolt-500/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold text-slate-50 group-hover:text-bolt-300 transition-colors">
                  {d.title}
                </div>
                <p className="mt-1.5 text-slate-300 text-sm leading-relaxed">
                  {d.description}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-bolt-400 transition-colors flex-shrink-0 mt-1" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
