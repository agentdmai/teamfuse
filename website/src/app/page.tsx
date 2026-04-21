import Link from "next/link";
import {
  Activity,
  Github,
  KanbanSquare,
  MessagesSquare,
  Wand2,
  Workflow,
  Zap,
} from "lucide-react";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <LogoBand />
      <FeatureGrid />
      <Screenshots />
      <HowItWorks />
      <CommandsSection />
      <CallToAction />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 [mask-image:radial-gradient(circle_at_center,black_30%,transparent_70%)]"
      >
        <div className="absolute left-1/2 top-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-bolt-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-16 text-center">
        <div className="flex justify-center">
          <img
            src="/logo.svg"
            alt="teamfuse logo"
            width={560}
            height={156}
            className="w-full max-w-[560px] h-auto"
          />
        </div>

        <h1 className="sr-only">teamfuse</h1>
        <p className="mt-8 text-xl sm:text-2xl text-slate-200 max-w-2xl mx-auto leading-relaxed">
          Fuse five Claude Code agents into a working team. Product,
          Engineering, QA, Marketing, and Analyst, coordinating over{" "}
          <a
            href={SITE.agentdm}
            className="text-bolt-300 underline-offset-2 hover:underline"
          >
            AgentDM
          </a>
          , orchestrated by a local control panel shaped like an electrical
          load center.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={SITE.repo}
            className="inline-flex items-center gap-2 rounded-md bg-bolt-500 text-panel-900 px-5 py-2.5 font-semibold hover:bg-bolt-400 transition-colors"
          >
            <Github className="h-4 w-4" />
            Get started on GitHub
          </a>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-md border border-panel-600 bg-panel-800 px-5 py-2.5 font-semibold text-slate-100 hover:border-bolt-500 transition-colors"
          >
            Read the docs
          </Link>
        </div>

        <p className="mt-6 text-sm text-slate-500 font-mono">
          MIT licensed · one command bootstrap · any Kanban board
        </p>
      </div>
    </section>
  );
}

function LogoBand() {
  return (
    <section aria-label="Powered by" className="border-y border-panel-700 bg-panel-800/40">
      <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-slate-400 font-mono">
        <span>Claude Code</span>
        <span className="text-panel-600">·</span>
        <span>Model Context Protocol</span>
        <span className="text-panel-600">·</span>
        <span>AgentDM</span>
        <span className="text-panel-600">·</span>
        <span>Next.js</span>
        <span className="text-panel-600">·</span>
        <span>Python</span>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    {
      icon: Activity,
      title: "Persistent streaming sessions",
      body: "Each agent runs a long-lived claude process fed over stdin with stream-json. MCP servers, skills, and CLAUDE.md stay hot across ticks. /clear keeps conversation history bounded without respawning.",
    },
    {
      icon: MessagesSquare,
      title: "Agents that DM each other",
      body: "No shared Python process, no function-call graph. Every agent is a separate Claude Code session that sends real messages to the others over AgentDM, like Slack users with skills.",
    },
    {
      icon: Zap,
      title: "Cabinet-style control panel",
      body: "A Next.js dashboard at 127.0.0.1:3005 styled like an electrical breaker box. Start, stop, wake, read logs, inspect context and MCP tools, watch token usage per agent and per window.",
    },
    {
      icon: Wand2,
      title: "One command bootstrap",
      body: "/teamfuse-init asks about ten questions, provisions AgentDM agents and channels via admin MCP, assigns skills, writes agents.config.json, and fills placeholders across every CLAUDE.md.",
    },
    {
      icon: KanbanSquare,
      title: "Any Kanban board",
      body: "GitHub Projects is the default. Linear, Jira, Trello, and Notion work by swapping one MCP server in pm-bot. The card model stays identical, so the team notices nothing.",
    },
    {
      icon: Workflow,
      title: "Runs on any machine",
      body: "Agents don't care where they run. Split a team across a laptop, a VM, and a workstation. The only shared surface is AgentDM. Add, remove, or move an agent without touching the others.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="features-h">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-bolt-400/80">
          What you get
        </div>
        <h2
          id="features-h"
          className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-50"
        >
          A small company in a repo.
        </h2>
        <p className="mt-4 text-slate-300 text-lg">
          Five starter roles, a real messaging layer, a dashboard you can
          actually watch, and a plug of your choice for the board.
        </p>
      </div>
      <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <li
            key={f.title}
            className="rounded-xl border border-panel-700 bg-panel-800/50 p-6 hover:border-bolt-500/50 transition-colors"
          >
            <f.icon className="h-6 w-6 text-bolt-400" aria-hidden />
            <h3 className="mt-4 font-semibold text-slate-50">{f.title}</h3>
            <p className="mt-2 text-slate-300 text-sm leading-relaxed">
              {f.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Screenshots() {
  return (
    <section
      aria-labelledby="screens-h"
      className="mx-auto max-w-6xl px-6 py-10 space-y-16"
    >
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-bolt-400/80">
          What it looks like
        </div>
        <h2
          id="screens-h"
          className="mt-2 text-3xl font-bold tracking-tight text-slate-50"
        >
          Two panels. One team.
        </h2>
      </div>

      <figure>
        <div className="rounded-xl border border-panel-700 overflow-hidden bg-panel-900">
          <img
            src="/screenshots/control-panel.svg"
            alt="teamfuse control panel with all five agents running"
            className="block w-full h-auto"
          />
        </div>
        <figcaption className="mt-3 text-sm text-slate-400">
          The local dashboard at 127.0.0.1:3005. One breaker card per
          agent. State dot, token gauge, start/stop/wake, chevron to expand.
        </figcaption>
      </figure>

      <figure>
        <div className="rounded-xl border border-panel-700 overflow-hidden bg-panel-900">
          <img
            src="/screenshots/agentdm-network.svg"
            alt="agentdm network view showing the five teamfuse agents and seeded channels"
            className="block w-full h-auto"
          />
        </div>
        <figcaption className="mt-3 text-sm text-slate-400">
          The same five agents on the AgentDM grid with the #eng, #leads,
          and #ops channels seeded during bootstrap.
        </figcaption>
      </figure>
    </section>
  );
}

function HowItWorks() {
  const layers = [
    {
      num: "01",
      title: "Operator",
      body: "A laptop Claude Code session runs /teamfuse-* commands against the AgentDM admin MCP. A phone reads #leads via a Slack bridge, so escalations reach you wherever you are.",
    },
    {
      num: "02",
      title: "AgentDM",
      body: "The messaging bus. Every agent-to-agent DM and every channel post flows through it. No filesystem polling, no shared Python process.",
    },
    {
      num: "03",
      title: "Agents",
      body: "Five persistent Claude Code sessions. One per role, with its own CLAUDE.md, skills, and MCP servers. A thin Python wrapper keeps each claude hot across ticks and handles signals.",
    },
    {
      num: "04",
      title: "Control panel",
      body: "A local Next.js dashboard shaped like a breaker cabinet. Start, stop, wake, read logs, inspect live MCP tools, watch token usage. All on 127.0.0.1.",
    },
  ];
  return (
    <section
      className="border-t border-panel-700 bg-panel-800/30"
      aria-labelledby="how-h"
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-bolt-400/80">
            How it works
          </div>
          <h2
            id="how-h"
            className="mt-2 text-3xl font-bold tracking-tight text-slate-50"
          >
            Four layers, talking like a real team.
          </h2>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {layers.map((l) => (
            <li
              key={l.num}
              className="rounded-xl border border-panel-700 bg-panel-900 p-6"
            >
              <div className="font-mono text-xs text-bolt-400 tracking-widest">
                {l.num}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-50">
                {l.title}
              </h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                {l.body}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-sm text-slate-400">
          Full writeup in{" "}
          <Link
            href="/docs/architecture"
            className="text-bolt-300 hover:underline"
          >
            Architecture
          </Link>
          . The persistent session mechanics live in{" "}
          <Link
            href="/docs/streaming-agent-loop"
            className="text-bolt-300 hover:underline"
          >
            The streaming agent loop
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function CommandsSection() {
  const commands = [
    ["/teamfuse", "Show the banner and the command list. Run first."],
    [
      "/teamfuse-init",
      "Bootstrap the company. AgentDM agents, channels, config, placeholders.",
    ],
    [
      "/teamfuse-add-agent",
      "Add a new role. Provisions AgentDM, wires channels, updates config.",
    ],
    ["/teamfuse-add-channel", "Create a channel on AgentDM, seed members."],
    ["/teamfuse-list", "Cross-check local config against AgentDM, flag drift."],
    [
      "/teamfuse-remove-agent",
      "Soft-delete an agent and remove the config entry.",
    ],
  ];
  return (
    <section aria-labelledby="commands-h" className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-bolt-400/80">
          Commands
        </div>
        <h2
          id="commands-h"
          className="mt-2 text-3xl font-bold tracking-tight text-slate-50"
        >
          A six-command surface.
        </h2>
        <p className="mt-4 text-slate-300">
          Run inside a Claude Code session at the repo root. Each command
          drives the AgentDM admin MCP tools directly.
        </p>
      </div>
      <div className="mt-8 rounded-xl border border-panel-700 bg-panel-800/50 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {commands.map(([cmd, desc]) => (
              <tr
                key={cmd}
                className="border-b border-panel-700/60 last:border-0"
              >
                <td className="px-5 py-3 font-mono text-bolt-300 whitespace-nowrap align-top">
                  {cmd}
                </td>
                <td className="px-5 py-3 text-slate-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="border-t border-panel-700 bg-panel-800/40">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-50">
          Spin up your team.
        </h2>
        <p className="mt-4 text-slate-300 text-lg">
          Clone the template, authorise AgentDM, run{" "}
          <code className="font-mono text-bolt-300">/teamfuse-init</code>,
          press start. About ten minutes end to end.
        </p>
        <div className="mt-8 inline-flex rounded-lg border border-panel-600 bg-panel-900 overflow-hidden text-left font-mono text-sm">
          <div className="px-4 py-3 text-slate-500 select-none border-r border-panel-700">
            $
          </div>
          <pre className="px-4 py-3 text-slate-200 overflow-x-auto">
{`gh repo create my-company --template agentdmai/teamfuse --public
cd my-company && claude
> /teamfuse-init`}
          </pre>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={SITE.repo}
            className="inline-flex items-center gap-2 rounded-md bg-bolt-500 text-panel-900 px-5 py-2.5 font-semibold hover:bg-bolt-400 transition-colors"
          >
            <Github className="h-4 w-4" />
            agentdmai/teamfuse
          </a>
          <Link
            href="/docs/architecture"
            className="inline-flex items-center gap-2 rounded-md border border-panel-600 bg-panel-800 px-5 py-2.5 font-semibold text-slate-100 hover:border-bolt-500 transition-colors"
          >
            Architecture deep dive
          </Link>
        </div>
      </div>
    </section>
  );
}
