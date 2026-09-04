import { describe, expect, it } from "vitest";

import { parseRawEvent, parseWorkflow } from "./index.js";

const queryTarget = {
  fingerprint: { role: "button", text: "查询" },
  locators: [{ strategy: "role", value: "button:查询", score: 0.95 }],
};

const validWorkflow = {
  schemaVersion: "1.0",
  id: "rta-query",
  version: 1,
  name: "查询 RTA 策略",
  startUrl: "https://fixture.example/rta",
  variables: {},
  steps: [
    { id: "step-001", type: "navigate", url: "https://fixture.example/rta" },
    { id: "step-002", type: "click", target: queryTarget },
  ],
  metadata: {
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T08:00:00.000Z",
  },
};

describe("RawEvent protocol", () => {
  it("parses an event with stable frame identity and path", () => {
    expect(
      parseRawEvent({
        schemaVersion: "1.0",
        id: "event-001",
        sessionId: "session-001",
        timestamp: 1_725_350_400_000,
        type: "click",
        url: "https://fixture.example/rta",
        frame: { frameId: 7, framePath: ["root", "rta-frame"] },
      }),
    ).toMatchObject({
      type: "click",
      frame: { frameId: 7, framePath: ["root", "rta-frame"] },
    });
  });

  it("rejects a RawEvent with an unsupported event type", () => {
    expect(() =>
      parseRawEvent({
        schemaVersion: "1.0",
        id: "event-001",
        sessionId: "session-001",
        timestamp: 1,
        type: "keypress",
        url: "https://fixture.example/rta",
        frame: { frameId: 0, framePath: [] },
      }),
    ).toThrowError("RawEvent validation failed");
  });
});

describe("Workflow DSL", () => {
  it("parses a valid workflow", () => {
    expect(parseWorkflow(validWorkflow)).toMatchObject({
      id: "rta-query",
      steps: [
        { type: "navigate" },
        { type: "click", target: queryTarget },
      ],
    });
  });

  it("rejects an unsupported schema version", () => {
    expect(() => parseWorkflow({ ...validWorkflow, schemaVersion: "2.0" })).toThrow(
      "Workflow validation failed",
    );
  });

  it("rejects duplicated step IDs", () => {
    expect(() =>
      parseWorkflow({
        ...validWorkflow,
        steps: [validWorkflow.steps[0], { ...validWorkflow.steps[1], id: "step-001" }],
      }),
    ).toThrowError("Workflow validation failed");
  });

  it.each([-0.01, 1.01])("rejects locator score %s outside the allowed range", (score) => {
    expect(() =>
      parseWorkflow({
        ...validWorkflow,
        steps: [
          validWorkflow.steps[0],
          {
            id: "step-002",
            type: "click",
            target: {
              ...queryTarget,
              locators: [{ ...queryTarget.locators[0], score }],
            },
          },
        ],
      }),
    ).toThrowError("Workflow validation failed");
  });

  it("rejects an interactive step without a target", () => {
    expect(() =>
      parseWorkflow({
        ...validWorkflow,
        steps: [validWorkflow.steps[0], { id: "step-002", type: "click" }],
      }),
    ).toThrowError("Workflow validation failed");
  });

  it("rejects an unknown step type", () => {
    expect(() =>
      parseWorkflow({
        ...validWorkflow,
        steps: [validWorkflow.steps[0], { id: "step-002", type: "hover", target: queryTarget }],
      }),
    ).toThrowError("Workflow validation failed");
  });
});
