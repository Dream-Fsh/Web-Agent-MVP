import { expect, it } from "vitest";
import type { RawEvent } from "@web-agent/protocol";
import { normalizeEvents } from "./index.js";

const event = (overrides: Partial<RawEvent>): RawEvent => ({
  schemaVersion:"1.0", id:"event", sessionId:"session", timestamp:0, type:"click", url:"https://console.test/rta",
  frame:{ frameId:0, framePath:[] }, element:{ tag:"button", attributes:{ "data-testid":"query" }, nearbyText:[], locatorCandidates:[] }, ...overrides,
});

it("merges input/change bursts and removes duplicate clicks without losing protocol context", () => {
  const actions = normalizeEvents([
    event({ id:"input-1", timestamp:100, type:"input", value:"1", element:{ tag:"input", attributes:{ name:"accountId" }, nearbyText:[], locatorCandidates:[] } }),
    event({ id:"input-2", timestamp:200, type:"input", value:"12", element:{ tag:"input", attributes:{ name:"accountId" }, nearbyText:[], locatorCandidates:[] } }),
    event({ id:"change", timestamp:250, type:"change", value:"12", element:{ tag:"input", attributes:{ name:"accountId" }, nearbyText:[], locatorCandidates:[] } }),
    event({ id:"click-1", timestamp:500, type:"click", metadata:{ tabId:7 } }),
    event({ id:"click-2", timestamp:650, type:"click", metadata:{ tabId:7 } }),
  ]);

  expect(actions).toEqual([
    expect.objectContaining({ type:"input", value:"12", sourceEventIds:["input-1", "input-2", "change"], context:{ sessionId:"session", frame:{ frameId:0, framePath:[] } } }),
    expect.objectContaining({ type:"click", sourceEventIds:["click-1"], context:{ sessionId:"session", tabId:7, frame:{ frameId:0, framePath:[] } } }),
  ]);
});

it("normalizes repeated SPA navigation and preserves tab and nested-frame context", () => {
  const actions = normalizeEvents([
    event({ id:"route-1", timestamp:100, type:"navigation", url:"https://console.test/rta/detail", metadata:{ navigationKind:"spa", tabId:3 }, frame:{ frameId:12, framePath:["root", "report"], frameUrl:"https://console.test/frame" }, element:undefined }),
    event({ id:"route-2", timestamp:300, type:"navigation", url:"https://console.test/rta/detail", metadata:{ navigationKind:"spa", tabId:3 }, frame:{ frameId:12, framePath:["root", "report"], frameUrl:"https://console.test/frame" }, element:undefined }),
    event({ id:"tab", timestamp:500, type:"tab-change", metadata:{ tabId:4 }, element:undefined }),
  ]);

  expect(actions).toEqual([
    expect.objectContaining({ type:"navigate", url:"https://console.test/rta/detail", sourceEventIds:["route-1", "route-2"], context:{ sessionId:"session", tabId:3, frame:{ frameId:12, framePath:["root", "report"], frameUrl:"https://console.test/frame" } }, metadata:{ navigationKind:"spa"} }),
    expect.objectContaining({ type:"switchTab", sourceEventIds:["tab"], context:{ sessionId:"session", tabId:4, frame:{ frameId:0, framePath:[] } } }),
  ]);
});

it("removes un-replayable interaction noise but retains actionable events", () => {
  const actions = normalizeEvents([
    event({ id:"noise", timestamp:10, type:"click", element:undefined }),
    event({ id:"generic-noise", timestamp:15, type:"click", element:{ tag:"button", attributes:{}, nearbyText:[], locatorCandidates:[] } }),
    event({ id:"submit", timestamp:20, type:"submit", element:undefined }),
  ]);
  expect(actions).toEqual([expect.objectContaining({ id:"submit", type:"submit", sourceEventIds:["submit"] })]);
});
