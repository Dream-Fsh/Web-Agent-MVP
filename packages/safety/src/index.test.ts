import { describe, expect, it } from "vitest";
import { UnsafeActionBlockedError, assertStepAllowed, assessStepRisk, classifyStep, redactRawEvent, redactSensitiveData, redactUrl, redactWorkflow } from "./index.js";

describe("recording redaction", () => {
  it("redacts secrets before a RawEvent can be persisted", () => {
    const event = redactRawEvent({ schemaVersion:"1.0", id:"e", sessionId:"s", timestamp:1, type:"input", url:"https://x.test/rta?access_token=secret", frame:{frameId:0,framePath:[],frameUrl:"https://x.test/frame?token=secret"}, value:"secret", element:{tag:"input",attributes:{type:"password",authorization:"Bearer secret"},nearbyText:[],locatorCandidates:[]} });
    expect(event.url).toBe("https://x.test/rta");
    expect(event.frame.frameUrl).toBe("https://x.test/frame");
    expect(event.value).toBe("[REDACTED]");
    expect(event.element?.attributes.authorization).toBe("[REDACTED]");
  });

  it("uses one URL redactor for workflows and diagnostic fields", () => {
    expect(redactUrl("https://x.test/rta?token=secret#section")).toBe("https://x.test/rta#section");
    const workflow = redactWorkflow({ schemaVersion:"1.0", id:"rta", version:1, name:"RTA", startUrl:"https://x.test/rta?account=10001", variables:{}, metadata:{createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z"}, steps:[{id:"go",type:"navigate",url:"https://x.test/report?token=secret"}] });
    expect(workflow.startUrl).toBe("https://x.test/rta");
    expect(workflow.steps[0]?.url).toBe("https://x.test/report");
    expect(redactSensitiveData({ diagnosticUrl:"https://x.test/failure?secret=1" })).toEqual({ diagnosticUrl:"https://x.test/failure" });
  });
});

describe("runtime safety", () => {
  it("always blocks destructive actions even with a resolvable locator", () => {
    const step = { id:"delete", type:"click" as const, target:{fingerprint:{role:"button",text:"删除广告"},locators:[{strategy:"role" as const,value:"button:删除广告",score:1}]} };
    expect(classifyStep(step)).toBe("destructive");
    expect(() => assertStepAllowed(step, { mode:"read-only" })).toThrow(UnsafeActionBlockedError);
  });
  it("allows read actions but blocks writes by default", () => {
    const search = { id:"search", type:"click" as const, target:{fingerprint:{text:"查询"},locators:[{strategy:"text" as const,value:"查询",score:0.8}]} };
    const save = { ...search, id:"save", target:{...search.target,fingerprint:{text:"保存"}} };
    expect(classifyStep(search)).toBe("safe");
    expect(() => assertStepAllowed(search, { mode:"read-only" })).not.toThrow();
    expect(() => assertStepAllowed(save, { mode:"read-only" })).toThrow(UnsafeActionBlockedError);
  });
  it("blocks unknown actions in read-only mode while exposing their assessment", () => {
    const unknown = { id:"opaque", type:"click" as const, target:{fingerprint:{text:"执行"},locators:[{strategy:"text" as const,value:"执行",score:1}]}};
    expect(assessStepRisk(unknown)).toMatchObject({ risk:"unknown" });
    expect(() => assertStepAllowed(unknown, { mode:"read-only" })).toThrow(UnsafeActionBlockedError);
  });
  it("blocks cross-origin navigation unless the destination is allowed", () => {
    const navigate = { id:"outside", type:"navigate" as const, url:"https://outside.test/report" };
    expect(() => assertStepAllowed(navigate, { mode:"read-only" }, "https://fixture.test/rta")).toThrow(UnsafeActionBlockedError);
    expect(() => assertStepAllowed(navigate, { mode:"read-only", allowedOrigins:["https://outside.test"] }, "https://fixture.test/rta")).not.toThrow();
  });
});
