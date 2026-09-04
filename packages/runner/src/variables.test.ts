import { expect, it } from "vitest";
import { resolveWorkflowValue } from "./variables.js";

it("resolves workflow variables recursively before executor dispatch", () => {
  expect(resolveWorkflowValue({ value:"{{accountId}}", nested:["prefix-{{accountId}}"] }, { accountId:"10001" })).toEqual({ value:"10001", nested:["prefix-10001"] });
});
