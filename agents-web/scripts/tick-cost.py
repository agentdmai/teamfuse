#!/usr/bin/env python3
"""Compute token usage + estimated USD cost for the most recent tick.

Invoked by agent-loop.sh after every `claude -p` call. Reads the agent's
session JSONL files at ~/.claude/projects/<slug>/ (slug = agent dir with
`/` replaced by `-`), filters events to those written since tick_start,
sums per-model usage, applies Anthropic public pricing, and prints a
single one-line summary to stdout.

usage: tick-cost.py <agent_dir> <tick_start_epoch>
"""
import glob
import json
import os
import sys
from datetime import datetime

# Anthropic public pricing (USD per 1M tokens), current as of 2026:
#   (input, output, cache_write_5m, cache_read)
# cache_write is the ~25% premium on first write; cache_read is ~10% of input.
# Pricing per model family: Opus / Sonnet / Haiku.
PRICING = {
    "opus":   (15.00, 75.00, 18.75, 1.50),
    "sonnet": (3.00,  15.00, 3.75,  0.30),
    "haiku":  (0.80,  4.00,  1.00,  0.08),
}


def price_for(model):
    m = (model or "").lower()
    if "opus" in m:
        return PRICING["opus"]
    if "sonnet" in m:
        return PRICING["sonnet"]
    if "haiku" in m:
        return PRICING["haiku"]
    return PRICING["sonnet"]


def fmt_tok(n):
    for unit, div in (("B", 1_000_000_000), ("M", 1_000_000), ("k", 1_000)):
        if n >= div:
            return "{:.2f}{}".format(n / div, unit)
    return str(int(n))


def short_model(model):
    # claude-opus-4-7 -> opus-4-7; claude-sonnet-4-6 -> sonnet-4-6
    if model.startswith("claude-"):
        return model[len("claude-"):]
    return model


def main():
    if len(sys.argv) < 3:
        print("usage: tick-cost.py <agent_dir> <tick_start_epoch>", file=sys.stderr)
        sys.exit(2)

    agent_dir = os.path.abspath(sys.argv[1])
    try:
        tick_start = float(sys.argv[2])
    except ValueError:
        print("tick-cost: invalid tick_start_epoch", file=sys.stderr)
        sys.exit(2)

    slug = agent_dir.replace("/", "-")
    session_dir = os.path.expanduser("~/.claude/projects/" + slug)
    if not os.path.isdir(session_dir):
        return  # silent: agent hasn't produced a session yet

    by_model = {}  # model -> [in, out, cc, cr, msgs]

    for path in glob.glob(os.path.join(session_dir, "*.jsonl")):
        # Skip files untouched during this tick — cheap filter before read.
        try:
            if os.path.getmtime(path) < tick_start - 1:
                continue
        except OSError:
            continue

        try:
            fp = open(path, "r", encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fp:
            for line in fp:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                ts = ev.get("timestamp") or ev.get("time")
                if not ts:
                    continue
                try:
                    t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except Exception:
                    continue
                if t.timestamp() < tick_start:
                    continue

                msg = ev.get("message") or {}
                usage = msg.get("usage") or {}
                if not usage:
                    continue

                model = msg.get("model") or "unknown"
                b = by_model.setdefault(model, [0, 0, 0, 0, 0])
                b[0] += int(usage.get("input_tokens") or 0)
                b[1] += int(usage.get("output_tokens") or 0)
                b[2] += int(usage.get("cache_creation_input_tokens") or 0)
                b[3] += int(usage.get("cache_read_input_tokens") or 0)
                b[4] += 1

    if not by_model:
        return  # no assistant events in this tick (timeout, crash, or idle)

    total_tok = 0
    total_cost = 0.0
    parts = []
    for model, (i, o, cc, cr, m) in sorted(by_model.items()):
        pin, pout, pcc, pcr = price_for(model)
        cost = (i * pin + o * pout + cc * pcc + cr * pcr) / 1_000_000.0
        tok = i + o + cc + cr
        total_tok += tok
        total_cost += cost
        parts.append(
            "{m}:msgs={msgs} tok={tok}({io}+cc={cc}+cr={cr}) ${c:.4f}".format(
                m=short_model(model),
                msgs=m,
                tok=fmt_tok(tok),
                io=fmt_tok(i + o),
                cc=fmt_tok(cc),
                cr=fmt_tok(cr),
                c=cost,
            )
        )

    print("tick-cost total=" + fmt_tok(total_tok) + " ${:.4f}  [".format(total_cost) + " | ".join(parts) + "]")


if __name__ == "__main__":
    main()
