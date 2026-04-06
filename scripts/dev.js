const { spawn } = require("node:child_process");
const path = require("node:path");

// Electron checks variable existence, so we must truly remove it.
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  // Windows may contain internal keys like "=C:" which break spawn with custom env.
  if (!key || key.includes("=") || value == null) continue;
  env[key] = String(value);
}
delete env.ELECTRON_RUN_AS_NODE;

const isWin = process.platform === "win32";
const command = path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  isWin ? "electron-vite.cmd" : "electron-vite"
);
const runCommand = isWin ? `"${command}" dev` : `${command} dev`;
const child = spawn(runCommand, {
  stdio: "inherit",
  env,
  shell: true
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

