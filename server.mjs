import { startWorkbench } from "./workbench.mjs";
import { startStudio } from "./receiver.mjs";
import { validateProjectRun } from "./project.mjs";
import { startWebAppGateway } from "./gateway.mjs";

const options = {};
const mapping = { "--project": "project", "--bot": "bot",
  "--port": "port", "--build-id": "buildId", "--devices": "devices", "--creator-url": "creatorUrl" };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--help") {
    console.log("UI: node tools/studio/server.mjs [--port 8787] [--creator-url <URL>]\nCLI: node tools/studio/server.mjs --project <dir> --bot bot/index.js [--devices devices.local.json]");
    process.exit(0);
  }
  if (!mapping[arg] || !process.argv[i + 1]) throw new Error("Unknown/missing option: " + arg);
  options[mapping[arg]] = process.argv[++i];
}
if (options.port !== undefined) {
  options.port = Number(options.port);
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error("Invalid port");
}
if (options.project) {
  const project = await validateProjectRun(options.project, { bot: options.bot });
  options.project = project.path; options.bot = project.bot; options.webRoot = project.webRoot;
}
let studio;
if (options.project) {
  const gateway = await startWebAppGateway();
  const publicWebAppUrl = options.webRoot ? gateway.webAppUrl(options.project, "pixelmug-studio.local") : null;
  try {
    const run = await startStudio({ ...options, host: "127.0.0.1", bind: "127.0.0.1", port: 0, publicWebAppUrl });
    if (options.webRoot) gateway.activate(options.project, run);
    studio = { ...run, webAppUrl: publicWebAppUrl, close: async closeOptions => {
      const result = await run.close(closeOptions); gateway.deactivate(run); await gateway.close(); return result;
    }};
  } catch (error) { await gateway.close(); throw error; }
} else studio = await startWorkbench(options);
console.log("Studio (PC browser): " + studio.studioUrl);
if (studio.webAppUrl) console.log("WebApp (Maopao App): " + studio.webAppUrl);
if (studio.debugDir) console.log("Logs: " + studio.debugDir);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  await studio.close();
});
