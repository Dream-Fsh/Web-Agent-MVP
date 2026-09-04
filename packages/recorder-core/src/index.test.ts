import { describe, expect, it } from "vitest";
import { createCapturedEvent, recordCapturedEvent } from "./index.js";

describe("Recorder persistence boundary", () => {
  it("redacts and schema-validates an event before the sink receives it", () => {
    const persisted: unknown[] = [];
    recordCapturedEvent({ schemaVersion:"1.0", id:"event-1", sessionId:"session-1", timestamp:1, type:"input", url:"https://fixture.test/login?token=secret", frame:{frameId:1,framePath:["root"]}, value:"secret", element:{tag:"input",attributes:{type:"password"},nearbyText:[],locatorCandidates:[]}, metadata:{prompt:"secret"} }, (event) => persisted.push(event));
    expect(persisted).toEqual([expect.objectContaining({ url:"https://fixture.test/login", value:"[REDACTED]", metadata:{prompt:"[REDACTED]"} })]);
  });
  it("does not call storage when the redacted event violates RawEvent schema", () => {
    const sink = () => { throw new Error("storage must not be called"); };
    expect(() => recordCapturedEvent({ schemaVersion:"1.0", id:"", sessionId:"s", timestamp:1, type:"click", url:"https://fixture.test", frame:{frameId:0,framePath:[]} }, sink)).toThrow("RawEvent validation failed");
  });
  it("creates protocol-owned tab and SPA events with stable frame context", () => {
    const context = { sessionId:"s", url:"https://fixture.test/spa", frame:{frameId:12,framePath:["root","billing"]} };
    expect(createCapturedEvent(context, { id:"tab", timestamp:1, type:"tab-change" })).toMatchObject({ schemaVersion:"1.0", type:"tab-change", frame:context.frame });
    expect(createCapturedEvent(context, { id:"nav", timestamp:2, type:"navigation", metadata:{navigationKind:"pushState"} })).toMatchObject({ type:"navigation", metadata:{navigationKind:"pushState"} });
  });
});
