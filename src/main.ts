import { config } from "./config.ts";
import { handler, stopAll } from "./server.ts";

console.log(`${config.title} · http://localhost:${config.port}`);
Deno.serve({ port: config.port, onListen: () => undefined, signal: shutdownSignal() }, handler);

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
