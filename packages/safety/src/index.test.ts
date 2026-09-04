import { describe, expect, it } from "vitest";
import { UnsafeActionBlockedError, assertStepAllowed, classifyStep, redactRawEvent } from "./index.js";

describe("recording redaction", () => {
  it("redacts secrets before a RawEvent can be persisted", () => {
    const event = redactRawEvent({ schemaVersion:"1.0", id:"e", sessionId:"s", timestamp:1, type:"input", url:"https://x.test/rta?access_token=secret", frame:{frameId:0,framePath:[]}, value:"secret", element:{tag:"input",attributes:{type:"password",authorization:"Bearer secret"},nearbyText:[],locatorCandidates:[]} });
    expect(event.url).toBe("https://x.test/rta");
    expect(event.value).toBe("[REDACTED]");
    expect(event.element?.attributes.authorization).toBe("[REDACTED]");
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
});
