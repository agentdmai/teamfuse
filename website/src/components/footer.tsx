import Link from "next/link";
import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-panel-700 bg-panel-900">
      <div className="mx-auto max-w-6xl px-6 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div className="md:col-span-2">
          <div className="font-mono text-slate-100 font-semibold">
            {SITE.name}
          </div>
          <p className="mt-2 text-slate-400 max-w-md">
            Open source template for running a team of Claude Code agents
            that DM each other and ship real work. MIT licensed.
          </p>
        </div>
        <div>
          <div className="text-slate-400 uppercase text-xs tracking-widest">
            Project
          </div>
          <ul className="mt-3 space-y-2 text-slate-300">
            <li>
              <a href={SITE.repo} className="hover:text-slate-50">
                GitHub
              </a>
            </li>
            <li>
              <Link href="/docs" className="hover:text-slate-50">
                Docs
              </Link>
            </li>
            <li>
              <a
                href={`${SITE.repo}/issues`}
                className="hover:text-slate-50"
              >
                Issues
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-slate-400 uppercase text-xs tracking-widest">
            Powered by
          </div>
          <ul className="mt-3 space-y-2 text-slate-300">
            <li>
              <a
                href="https://docs.anthropic.com/claude/claude-code"
                className="hover:text-slate-50"
              >
                Claude Code
              </a>
            </li>
            <li>
              <a href={SITE.agentdm} className="hover:text-slate-50">
                AgentDM
              </a>
            </li>
            <li>
              <a
                href="https://modelcontextprotocol.io"
                className="hover:text-slate-50"
              >
                Model Context Protocol
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-panel-700">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-slate-500 flex items-center justify-between">
          <span>
            © {new Date().getFullYear()} AgentDM. Released under the MIT
            license.
          </span>
          <span>teamfuse.dev</span>
        </div>
      </div>
    </footer>
  );
}
