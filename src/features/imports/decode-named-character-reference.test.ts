import { describe, expect, it } from "vitest";

import { decodeNamedCharacterReference } from "./decode-named-character-reference";

describe("decodeNamedCharacterReference", () => {
  it.each([
    ["amp", "&"],
    ["not", "¬"],
    ["semi", ";"],
    ["hellip", "…"],
    ["eacute", "é"],
  ])("decodes %s", (name, expected) => {
    expect(decodeNamedCharacterReference(name)).toBe(expected);
  });

  it.each(["notit", "unknown", "", "constructor", "__proto__", "toString"])("does not decode %j", (name) => {
    expect(decodeNamedCharacterReference(name)).toBe(false);
  });
});
