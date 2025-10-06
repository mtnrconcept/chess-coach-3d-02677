import { describe, expect, test } from "bun:test";

import { generateCustomRules } from "../supabase/functions/generate-custom-rules/core.ts";

const buildResponse = (content: string) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );

describe("generateCustomRules sanitisation", () => {
  test("removes patches using unsupported chained selectors", async () => {
    const ruleSpecPayload = JSON.stringify({
      meta: {
        name: "Pions sauteurs",
        base: "chess-base@1.0.0",
        version: "1.0.0",
        description: "Variante test",
      },
      patches: [
        {
          op: "replace",
          path: "prompt_movelist_steps[move][1].aspect",
          value: "highlight",
        },
      ],
    });

    const pluginPayload = `'use strict';\nmodule.exports = {\n  id: helpers.ruleId || 'test-rule',\n  name: 'Pions sauteurs',\n  description: 'Variante test',\n  onGenerateExtraMoves() { return []; },\n  onBeforeMoveApply() { return { allow: true }; },\n  onAfterMoveApply() {},\n  onTurnStart() {},\n};`;

    const requests: Array<{ model: string }> = [];
    const warnings: string[] = [];

    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      requests.push({ model: body.model });

      if (body.model === "google/gemini-2.5-flash") {
        return buildResponse(ruleSpecPayload);
      }

      if (body.model === "google/gemini-2.5-pro") {
        return buildResponse(pluginPayload);
      }

      throw new Error(`Unexpected model ${body.model}`);
    };

    const logger = {
      info: () => {},
      error: () => {},
      warn: (message: string) => {
        warnings.push(message);
      },
    } as const;

    const result = await generateCustomRules(
      { description: "Les pions peuvent sauter", difficulty: "intermediate" },
      { lovableApiKey: "demo", fetchImpl, logger },
    );

    expect(result.ruleSpec.patches?.length ?? 0).toBe(0);
    expect(warnings.some((entry) => entry.includes("prompt_movelist_steps"))).toBe(true);
    expect(requests.filter((entry) => entry.model === "google/gemini-2.5-flash").length).toBe(1);
    expect(requests.filter((entry) => entry.model === "google/gemini-2.5-pro").length).toBe(1);
  });
});
