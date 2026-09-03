import { describe, expect, it } from "vitest";
import { recordCapturedEvent } from "./index.js";

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
});
