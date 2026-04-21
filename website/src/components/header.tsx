import Link from "next/link";
import { Github } from "lucide-react";
import { SITE } from "@/lib/site";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-panel-700 bg-panel-900/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-mono text-sm font-semibold tracking-tight text-slate-100 hover:text-bolt-300 transition-colors"
          aria-label={`${SITE.name} home`}
        >
          <Bolt className="h-5 w-5 text-bolt-400" />
          {SITE.name}
        </Link>
        <nav className="flex items-center gap-6 text-sm text-slate-300">
          <Link href="/docs" className="hover:text-slate-50 transition-colors">
            Docs
          </Link>
          <Link
            href="/docs/architecture"
            className="hover:text-slate-50 transition-colors"
          >
            Architecture
          </Link>
          <Link
            href="/docs/board-integration"
            className="hover:text-slate-50 transition-colors"
          >
            Boards
          </Link>
          <a
            href={SITE.repo}
            className="inline-flex items-center gap-1.5 rounded-md border border-panel-600 bg-panel-800 px-2.5 py-1 text-slate-200 hover:border-bolt-500 hover:text-slate-50 transition-colors"
            aria-label="View teamfuse on GitHub"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

function Bolt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <polygon
        points="17.5,3 4.5,19 15.5,19 14.5,29 27.5,13 16.5,13 17.5,3"
        fill="currentColor"
      />
    </svg>
  );
}
