import { characterEntities } from "character-entities";

/**
 * Entity lookup for Web Workers.
 *
 * The `decode-named-character-reference` package resolves to a DOM-based build in browser bundles, and that build
 * reads `document` while loading, which a worker does not have. `next.config.ts` points the package at this module,
 * which mirrors the package's own non-DOM implementation.
 */
export function decodeNamedCharacterReference(value: string): string | false {
  return Object.hasOwn(characterEntities, value) ? (characterEntities[value] ?? false) : false;
}
