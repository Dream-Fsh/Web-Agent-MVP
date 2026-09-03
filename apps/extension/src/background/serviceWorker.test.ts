import { expect, it } from "vitest";
import { registerRuntimeListener } from "./serviceWorker.js";

it("persists only raw-event messages through the background safety boundary", () => {
  let listener: ((message: unknown, sender: { frameId?: number }) => void) | undefined;
  const persisted: unknown[] = [];
  registerRuntimeListener({ onMessage: { addListener: (handler) => { listener = handler; } } }, (event) => persisted.push(event));
  listener?.({ kind:"ignore" }, {});
  listener?.({ kind:"raw-event", event:{ schemaVersion:"1.0",id:"e",sessionId:"s",timestamp:1,type:"click",url:"https://x.test?a=1",frame:{frameId:0,framePath:[]} } }, { frameId:9 });
  expect(persisted).toEqual([expect.objectContaining({ url:"https://x.test/",frame:{frameId:9,framePath:[]} })]);
});
