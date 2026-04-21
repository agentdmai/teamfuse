import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <div className="font-mono text-bolt-400 text-sm tracking-widest">404</div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-50">
        Breaker not found.
      </h1>
      <p className="mt-3 text-slate-400">
        That page either flipped off or was never wired in. Start from the
        landing panel and try again.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-md bg-bolt-500 text-panel-900 px-4 py-2 font-semibold hover:bg-bolt-400 transition-colors"
        >
          Go home
        </Link>
        <Link
          href="/docs"
          className="rounded-md border border-panel-600 bg-panel-800 px-4 py-2 font-semibold text-slate-100 hover:border-bolt-500 transition-colors"
        >
          Read the docs
        </Link>
      </div>
    </div>
  );
}
