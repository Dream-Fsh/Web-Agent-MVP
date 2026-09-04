import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Workflow } from "@web-agent/protocol";
import { saveWorkflowVersion } from "@web-agent/codex-adapter";
import { runCli } from "./index.js";

const workflow = (version: number): Workflow => ({ schemaVersion:"1.0", id:"rta-check", version, name:"RTA", startUrl:"https://fixture.test/rta", variables:{}, steps:[], metadata:{ createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" } });

it("lists workflow history and rolls current workflow back through the CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-agent-cli-"));
  try {
    const workflowsRoot = join(root, "workflows");
    await saveWorkflowVersion(workflowsRoot, "rta-check", workflow(1));
    await saveWorkflowVersion(workflowsRoot, "rta-check", workflow(2));
    expect(await runCli(["workflow", "history", "rta-check"], { workflowsRoot })).toContain("v1.json\nv2.json");
    await runCli(["workflow", "rollback", "rta-check", "1"], { workflowsRoot });
    expect(JSON.parse(await readFile(join(workflowsRoot, "rta-check", "current.json"), "utf8"))).toMatchObject({ version:1 });
  } finally { await rm(root, { recursive:true, force:true }); }
});

it("recognizes all required command surfaces without executing external actions", async () => {
  for (const args of [["login"], ["record"], ["workflow", "list"], ["workflow", "inspect", "rta-check"], ["run", "rta-check", "--var", "accountId=10001"], ["failures", "list"], ["repair", "run-1"]]) {
    await expect(runCli(args, { workflowsRoot:"missing" })).resolves.toMatch(/manual|workflow|No workflows|not configured|failures/i);
  }
});
