import { expect, it } from "vitest";
import { adaptRecording } from "./index.js";

it("adapts enriched source actions to redacted RawEvents without exporting source types", () => {
  expect(adaptRecording({ id:"s", actions:[{ id:"a", timestamp:1, type:"input", url:"https://x.test?a=1", frame:{frameId:2,framePath:["root"]}, value:"secret", attributes:{type:"password"} }] })).toEqual([expect.objectContaining({ sessionId:"s",url:"https://x.test/",value:"[REDACTED]",frame:{frameId:2,framePath:["root"]} })]);
});
it("rejects source actions that lack stable frame identity", () => {
  expect(() => adaptRecording({ id:"s", actions:[{ id:"a", timestamp:1, type:"click", url:"https://x.test" }] })).toThrow("frame identity");
});
