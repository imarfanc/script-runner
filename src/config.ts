export type InstancePolicy = "multiple" | "focus" | "rerun";

/** Settings the catalog hands to the browser. Everything here is public. */
export const clientConfig = {
  title: "Script Runner",
  favicon: "/favicon.svg",
  columnWidths: { facets: 240, scripts: 360, workspace: 960 },
  defaultTerminalSize: { width: 720, height: 420 },
  defaultInstancePolicy: "multiple" as InstancePolicy,
};

export const config = {
  ...clientConfig,
  scriptsRoot: new URL("../data/scripts/", import.meta.url),
};
