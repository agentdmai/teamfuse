# screenshots

Drop two images here. The root `README.md` references them by exact
filename, so name them as follows:

## `control-panel.png`

A screenshot of the teamfuse control panel at `http://127.0.0.1:3005`
with all five agent breakers running. Ideally:

* window roughly 1200 by 900, so the cabinet fits without scrollbars
* every agent card expanded enough to show the state dot
* at least one card with the log modal or context modal open, to hint
  at what the chevron reveals

Captured via your OS screenshot tool (macOS: `Cmd+Shift+4`, then drag).

## `agentdm-network.png`

A screenshot of the AgentDM dashboard's network view
(`app.agentdm.ai`) showing the five teamfuse agents and the seeded
channels. Ideally:

* the agent roster visible (`@pm-bot`, `@eng-bot`, `@qa-bot`,
  `@marketing`, `@analyst`)
* the channel list visible (`#eng`, `#leads`, `#ops`)
* recent activity indicator on at least one edge so the image shows
  the team is actually talking

## Pushing them

```bash
cd /path/to/teamfuse
# drop control-panel.png and agentdm-network.png into docs/screenshots/
git add docs/screenshots/control-panel.png docs/screenshots/agentdm-network.png
git commit -m "Add teamfuse screenshots to README"
git push
```
