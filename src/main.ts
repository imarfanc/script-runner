import { handler, stopAll } from "./server.ts";

/**
 * `deno task dev` and `deno task start` set PORT from `_other/scripts/config.ts`;
 * the fallback only applies when this file is run directly.
 */
const port = Number(Deno.env.get("PORT") ?? "8000");

Deno.serve({ port, onListen: () => undefined, signal: shutdownSignal() }, handler);

function shutdownSignal(): AbortSignal {
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    Deno.addSignalListener(signal, () => {
      stopAll();
      controller.abort();
    });
  }
  return controller.signal;
}
