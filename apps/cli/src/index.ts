import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { rollbackWorkflow } from "@web-agent/codex-adapter";

export interface CliOptions { workflowsRoot?: string }
const rootFor = (options: CliOptions) => options.workflowsRoot ?? join(process.cwd(), "workflows");

async function workflowList(root: string): Promise<string[]> { try { return (await readdir(root, { withFileTypes:true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); } catch { return []; } }

/** Command dispatcher. Browser-affecting commands stay explicit and manual until configured. */
export async function runCli(args: string[], options: CliOptions = {}): Promise<string> {
  const [command, subcommand, name, version] = args;
  const workflowsRoot = rootFor(options);
  if (command === "login") return "Manual login required in data/browser-profile/";
  if (command === "record") return "Recording is not configured; configure the extension and browser profile.";
  if (command === "run") return `Workflow run is not configured for ${subcommand ?? "workflow"}.`;
  if (command === "repair") return `Repair is not configured for ${subcommand ?? "run"}.`;
  if (command === "failures" && subcommand === "list") return "No failures configured.";
  if (command === "workflow" && subcommand === "list") {
    const workflows = await workflowList(workflowsRoot);
    return workflows.length ? workflows.join("\n") : "No workflows";
  }
  if (command === "workflow" && subcommand === "history" && name) {
    return (await readdir(join(workflowsRoot, name))).filter((file) => /^v\d+\.json$/.test(file)).sort().join("\n");
  }
  if (command === "workflow" && subcommand === "inspect" && name) {
    try { return await readFile(join(workflowsRoot, name, "current.json"), "utf8"); }
    catch { return `workflow ${name} is not configured`; }
  }
  if (command === "workflow" && subcommand === "rollback" && name && version) {
    await rollbackWorkflow(workflowsRoot, name, Number(version));
    return `workflow ${name} rolled back to v${version}`;
  }
  return "workflow command not configured";
}
