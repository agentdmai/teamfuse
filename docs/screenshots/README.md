# screenshots

Two images for the README's "What it looks like" section.

## Current state: SVG simulations

The repo ships with hand-drawn SVG simulations:

* `control-panel.svg`, drawn from the actual `agents-web` component
  structure (breaker cards, usage panel, master breaker, cabinet
  nameplate). Reflects one plausible running state: two agents working,
  one sleeping, one starting, one querying.
* `agentdm-network.svg`, a roster + graph mockup of the five teamfuse
  agents and the three seeded channels on AgentDM. Includes a recent
  feed panel on the right so the image reads as a live team.

Both are inline-rendered by GitHub as if they were PNGs.

## Replacing with real captures

Capture the real dashboards whenever you want. Naming convention: PNG,
same base names, next to the SVGs.

### `control-panel.png`

The teamfuse control panel at `http://127.0.0.1:3005` with all five
agent breakers running. Ideal window roughly 1200 by 900, every agent
card in view, one card with the log or context modal open to hint at
what the chevron reveals. macOS: `Cmd+Shift+4`, drag the window.

### `agentdm-network.png`

The AgentDM dashboard (`app.agentdm.ai`), network view, showing the
five teamfuse aliases (`@pm-bot`, `@eng-bot`, `@qa-bot`, `@marketing`,
`@analyst`) and the three seeded channels (`#eng`, `#leads`, `#ops`).

### Switching the README over to PNGs

Edit the root `README.md` and swap `.svg` for `.png` in the two
`![...]` image references, then:

```bash
cd /path/to/teamfuse
git add docs/screenshots/control-panel.png docs/screenshots/agentdm-network.png README.md
git commit -m "Replace SVG simulations with real screenshots"
git push
```

(You can also keep both. The repo does not mind; GitHub just renders
whichever one the README points at.)
