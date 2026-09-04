import { expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveFailurePackage } from "./index.js";

it("persists a redacted minimal failure package without full HTML", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-agent-failure-"));
  try {
    const location = await saveFailurePackage({ runId:"run-1", stepId:"step-1", error:{ message:"authorization=secret" }, domContext:{ nearbyText:["password=secret"], structure:["form > input"] }, target:{ locators:["token=secret"] }, workflow:{ parameters:{ token:"secret" } }, fullHtml:"<html>secret</html>", screenshot:Buffer.from("png"), trace:Buffer.from("zip") }, root);
    expect((await readdir(location)).sort()).toEqual(["dom-context.json", "failure.json", "screenshot.png", "target.json", "trace.zip", "workflow.snapshot.json"]);
    expect(await readFile(join(location, "failure.json"), "utf8")).toContain("[REDACTED]");
    expect(await readFile(join(location, "dom-context.json"), "utf8")).not.toContain("secret");
    expect(await readFile(join(location, "workflow.snapshot.json"), "utf8")).not.toContain("<html");
  } finally { await rm(root, { recursive:true, force:true }); }
});
