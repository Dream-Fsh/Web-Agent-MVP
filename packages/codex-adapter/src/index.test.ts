import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Workflow } from "@web-agent/protocol";
import { applyRepairPatch, RepairPatchRejectedError, saveWorkflowVersion, rollbackWorkflow } from "./index.js";

const workflow = (): Workflow => ({ schemaVersion:"1.0", id:"rta-check", version:1, name:"RTA", startUrl:"https://fixture.test/rta", variables:{}, metadata:{ createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" }, steps:[{ id:"query", type:"click", target:{ fingerprint:{ role:"button" }, locators:[{ strategy:"role", value:"查询", score:1 }] } }] });

it("applies only locator repair operations and retains a schema-valid safe workflow", () => {
  const repaired = applyRepairPatch(workflow(), { operations:[{ type:"addLocator", stepId:"query", locator:{ strategy:"testId", value:"query", score:1 } }] });
  expect(repaired.steps[0].target?.locators[0].strategy).toBe("role");
  expect(repaired.steps[0].target?.locators).toHaveLength(2);
});

it("rejects repair patches that attempt forbidden workflow mutations", () => {
  expect(() => applyRepairPatch(workflow(), { operations:[{ type:"deleteAssertion", stepId:"query" }] } as never)).toThrow(RepairPatchRejectedError);
  expect(() => applyRepairPatch(workflow(), { operations:[{ type:"replaceLocator", stepId:"query", index:0, locator:{ strategy:"text", value:"删除广告", score:1 } }] })).toThrow(RepairPatchRejectedError);
});

it("stores immutable workflow versions and rolls current back to a requested version", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-agent-workflows-"));
  try {
    await saveWorkflowVersion(root, "rta-check", workflow());
    await saveWorkflowVersion(root, "rta-check", { ...workflow(), version:2 });
    await rollbackWorkflow(root, "rta-check", 1);
    expect(JSON.parse(await readFile(join(root, "rta-check", "current.json"), "utf8"))).toMatchObject({ version:1 });
  } finally { await rm(root, { recursive:true, force:true }); }
});

it("redacts workflow URL queries before persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-agent-workflows-"));
  try {
    await saveWorkflowVersion(root, "rta-check", { ...workflow(), startUrl:"https://fixture.test/rta?accountId=10001", steps:[{ id:"go", type:"navigate", url:"https://fixture.test/rta?token=secret" }] });
    const current = JSON.parse(await readFile(join(root, "rta-check", "current.json"), "utf8"));
    expect(current.startUrl).toBe("https://fixture.test/rta");
    expect(current.steps[0].url).toBe("https://fixture.test/rta");
  } finally { await rm(root, { recursive:true, force:true }); }
});
