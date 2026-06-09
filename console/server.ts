import index from "./index.html";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const port = Number(Bun.env.PORT ?? 3001);

Bun.serve({
  port,
  routes: {
    "/api/dev-creds": () => {
      const p = join(homedir(), ".mce-scanner", "creds.json");
      if (!existsSync(p)) return new Response("not found", { status: 404 });
      return Response.json(JSON.parse(readFileSync(p, "utf8")));
    },
    "/*": index,
  },
  development: { hmr: true, console: true },
});

console.log(`Console running at http://localhost:${port}`);
