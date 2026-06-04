import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const server = spawn(process.execPath, [join(root, "src", "index.js")], {
  stdio: ["pipe", "pipe", "inherit"]
});

const responses = [];
let buffer = "";

server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  buffer += chunk;

  let newlineIndex;
  while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (line) {
      responses.push(JSON.parse(line));
    }
  }
});

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "smoke-test",
      version: "0.1.0"
    }
  }
});
send({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {}
});

setTimeout(() => {
  server.kill();

  const initialize = responses.find((response) => response.id === 1);
  const toolsList = responses.find((response) => response.id === 2);

  if (!initialize?.result?.serverInfo?.name) {
    throw new Error("initialize response missing serverInfo.name");
  }

  if (!Array.isArray(toolsList?.result?.tools) || toolsList.result.tools.length !== 3) {
    throw new Error("tools/list response missing expected tools");
  }

  console.log("Protocol smoke test passed.");
  process.exit(0);
}, 250);
