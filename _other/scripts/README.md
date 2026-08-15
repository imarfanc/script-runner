# Repository scripts

Standalone repository utilities that deliberately do not import from `data/`, `public/`, or `src/`.

- `config.ts` holds the settings these scripts share — title, repository root, port, base URL,
  entrypoint, watch paths, and the Helium path. `serve.ts` owns the port and passes it to the server
  as `PORT` — `src/` no longer carries a port setting, and the fallback in `src/main.ts` only
  applies when that file is run directly.
- `style.ts` holds the shared terminal styling: one palette, message labels (`info`, `ok`, `warn`,
  `error`, `fail`), screen and cursor escapes, box drawing, and display-width helpers. Scripts
  should use these rather than raw ANSI codes.
- `choose.ts` presents the four primary tasks in run, check, and repo groups. It supports keyboard
  navigation, mouse-wheel movement, and click-to-select/click-again-to-run.
- `git-history.ts` writes `_other/git/git-history.md` and `_other/git/git-messages.md` directly from
  Git.
- `serve.ts` supervises both `dev` and `start`, prints the startup table, and owns the browser and
  shutdown hotkeys.
- `icons.ts` holds single-cell Nerd Font glyphs for the serve banner.

Run the chooser with `deno task choose`. A task can also be selected without the UI, for example
`deno task choose check`.
