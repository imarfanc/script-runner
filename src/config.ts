export const config = {
  title: "WhatsApp Sender",
  favicon: "/favicon.svg",
  port: Number(Deno.env.get("PORT") ?? "8000"),
  groupsPath: new URL("../data/groups.yaml", import.meta.url),
  outputRoot: new URL("../data/output/", import.meta.url),
  jobsPath: new URL("../data/jobs.json", import.meta.url),
  senderDir: new URL("../data/whatsapp/", import.meta.url),
  senderBuildDir: new URL("../data/whatsapp/.build/", import.meta.url),
  payloadsDir: new URL("../data/whatsapp/payloads/", import.meta.url),
};
