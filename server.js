import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve("dist");
http
  .createServer((req, res) => {
    try {
      const file = path.resolve(
        root,
        "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
      );
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403).end();
        return;
      }
      const target = file === root ? path.join(root, "index.html") : file;
      const data = fs.readFileSync(target);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[path.extname(target)] || "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () => console.log("Local: http://127.0.0.1:4173"));
