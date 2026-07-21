# AGENTS.md

## Cursor Cloud specific instructions

This repository is the GitHub organization profile repo for **Viato Labs** (`viato-labs/.github`).

- The only tracked content is `profile/README.md`, which GitHub renders on the org profile page (`https://github.com/viato-labs`).
- There is **no application code, package manifest, build system, test suite, or lint config** in this repo. There is nothing to `install`, `build`, `test`, or `lint`, and there are no services/ports to run.
- The three products described in the README (FlowBlox, SendBlox, Viato) live in **separate repositories** under the `viato-labs` org — not here.
- "Running the app" for this repo means previewing `profile/README.md` as GitHub would render it. The most faithful tool is `grip` (renders via GitHub's API, needs network); a fully offline alternative is any local Markdown-to-HTML renderer (e.g. Python `markdown`) served over `python3 -m http.server`.
- Because there are no dependencies, the startup update script is intentionally a no-op.
