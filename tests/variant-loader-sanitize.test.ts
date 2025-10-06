import { describe, expect, test } from "bun:test";

import {
  getExternalRuleSource,
  registerExternalRuleFromSource,
} from "../src/variant-chess-lobby.ts";

describe("registerExternalRuleFromSource sanitisation", () => {
  test("normalises curly quotes, nbsp and zero-width characters", () => {
    const raw = "\uFEFF```js\nmodule.exports = {\n\tid: helpers.ruleId || 'pions-sauteurs',\n\tname: “Pions sauteurs”,\n\tdescription: 'Variante test',\n\tonGenerateExtraMoves() { return []; },\n\tonBeforeMoveApply() { return { allow: true }; },\n\tonAfterMoveApply() {},\n\tonTurnStart() {},\n};\n```\u200B";

    const result = registerExternalRuleFromSource("pions-sauteurs", raw);

    expect(result.ok).toBe(true);
    expect(result.reused).not.toBe(true);
    const stored = getExternalRuleSource("pions-sauteurs");
    expect(stored).toBeDefined();
    expect(stored?.includes("“")).toBe(false);
    expect(stored?.includes("\u00A0")).toBe(false);
    expect(stored?.includes("\u200B")).toBe(false);
  });
});
