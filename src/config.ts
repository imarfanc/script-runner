export type InstancePolicy = "multiple" | "focus" | "rerun";

/** "system" follows the macOS appearance and switches with it, live. */
export type Theme = "system" | "light" | "dark";

/** Which marker field the script list is divided by. "none" leaves it flat. */
export type ScriptGrouping = "group" | "space" | "section" | "none";

/** Settings the catalog hands to the browser. Everything here is public. */
export const clientConfig = {
  title: "Script Runner",
  favicon: "/favicon.svg",
  /**
   * Fixed pixel widths for the two index columns. The workspace takes whatever
   * is left; give it a number instead of "auto" to hold a minimum width and let
   * the page scroll horizontally below it.
   */
  theme: "system" as Theme,
  /** Change this to re-cut the script list without touching the frontend. */
  groupBy: "section" as ScriptGrouping,
  columnWidths: { facets: 240, scripts: 320, workspace: "auto" as number | "auto" },
  defaultTerminalSize: { width: 720, height: 420 },
  defaultInstancePolicy: "multiple" as InstancePolicy,
};

export const config = {
  ...clientConfig,
  scriptsRoot: new URL("../data/scripts/", import.meta.url),
  /** The server only ever listens on localhost, so "the editor" is this machine's. */
  editorCommand: Deno.env.get("EDITOR_COMMAND") ?? "cursor",
};
