import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptRecording, persistRecording } from "./index.js";

it("adapts enriched source actions to redacted RawEvents without exporting source types", () => {
  expect(adaptRecording({ id:"s", actions:[{ id:"a", timestamp:1, type:"input", url:"https://x.test?a=1", frame:{frameId:2,framePath:["root"]}, value:"secret", attributes:{type:"password"} }] })).toEqual([expect.objectContaining({ sessionId:"s",url:"https://x.test/",value:"[REDACTED]",frame:{frameId:2,framePath:["root"]} })]);
});
it("persists only adapted RawEvents as NDJSON with recording metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "web-agent-recording-"));
  try {
    const location = await persistRecording({ id:"s", actions:[{ id:"a", timestamp:1, type:"click", url:"https://x.test?q=secret", frame:{frameId:0,framePath:[]} }] }, root);
    expect(JSON.parse(await readFile(location.metadataPath, "utf8"))).toMatchObject({ sessionId:"s", eventCount:1 });
    expect(await readFile(location.rawEventsPath, "utf8")).toContain('"url":"https://x.test/"');
  } finally { await rm(root, { recursive:true, force:true }); }
});
it("rejects source actions that lack stable frame identity", () => {
  expect(() => adaptRecording({ id:"s", actions:[{ id:"a", timestamp:1, type:"click", url:"https://x.test" }] })).toThrow("frame identity");
});
