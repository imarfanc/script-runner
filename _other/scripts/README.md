# Repository scripts

Standalone repository utilities that deliberately do not import from `data/`, `public/`, or `src/`.

- `choose.ts` presents the four primary tasks in run, check, and repo groups. It supports keyboard
  navigation, mouse-wheel movement, and click-to-select/click-again-to-run.
- `git-history.ts` writes `_other/git/git-history.md` and `_other/git/git-messages.md` directly from
  Git.
- `serve.ts` supervises both `dev` and `start`, prints the startup table, and owns the browser and
  shutdown hotkeys.
- `icons.ts` adapts Font Awesome Unicode code points for single-cell rendering through the
  configured Nerd Font.

Run the chooser with `deno task choose`. A task can also be selected without the UI, for example
`deno task choose check`.
