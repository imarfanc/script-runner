# Script Runner

A local, metadata-driven Deno app for discovering and running scripts in draggable output windows.

```bash
deno task dev
```

Open <http://localhost:8000>. App identity, theme, script grouping, column widths, favicon, and
default window behavior live in `src/config.ts` — `theme` is `system` (follows the macOS appearance,
live), `light`, or `dark`, and `groupBy` cuts the script list by `group`, `space`, `section`, or
`none`. The port lives in `_other/scripts/config.ts` and is passed to the server as `PORT`. Tests
live in `src/tests/`. Scripts are discovered recursively under `data/scripts/`; each script
directory contains a strict `_script.yaml` v2 marker and its entry file.

See the example markers under `data/scripts/examples/`. The supported languages are `bash`, `zsh`,
`python`, `javascript`, `deno`, `bun`, `applescript`, and `swift`. A marker can supply `command` and
`args` to override the language launcher.

## Development note

Keep the HTML and generated DOM as simple and shallow as possible. Avoid unnecessary wrappers and
preserve descriptive IDs for major elements.
