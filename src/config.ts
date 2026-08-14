export type InstancePolicy = "multiple" | "focus" | "rerun";

export const config = {
  title: "Script Runner",
  favicon: "/favicon.svg",
  scriptsRoot: new URL("../data/scripts/", import.meta.url),
  port: Number(Deno.env.get("PORT") ?? "8000"),
  columnWidths: { facets: 240, scripts: 360, workspace: 960 },
  defaultTerminalSize: { width: 720, height: 420 },
  defaultInstancePolicy: "multiple" as InstancePolicy,
};
