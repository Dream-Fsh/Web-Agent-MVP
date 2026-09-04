import { expect, it } from "vitest";
import { evaluateAssertions } from "./index.js";

it("requires every required assertion for workflow success", async () => {
  const page = { url: () => "https://fixture.test/rta" } as never;
  const result = await evaluateAssertions(page, [
    { id:"url", type:"assertUrl", expected:"/rta", required:true },
    { id:"bad-url", type:"assertUrl", expected:"/dashboard", required:true },
    { id:"optional", type:"assertUrl", expected:"/dashboard", required:false },
  ]);
  expect(result.success).toBe(false);
  expect(result.results.map((item) => item.status)).toEqual(["passed", "failed", "failed"]);
});
