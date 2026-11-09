/**
 * Name handling shared by the alias and group stores.
 *
 * Aliases and group names live in one flat namespace: a request naming either
 * one resolves to the same kind of routing target, so they must agree on when
 * two names are the same name. They agree by folding case.
 *
 * Folding is not cosmetic. Without it `Good` and `good` are two names, so a
 * model claiming a name that another model already holds slips past the
 * collision check, lands in a second alias, and never joins the group that
 * owns the name. Folding makes the collision path — merge into one group —
 * reachable from every spelling of the name.
 *
 * Only names are folded. Model ids keep their case: they are provider data and
 * `ling_Ling-3.2-flash` is a different model from a hypothetical
 * `ling_ling-3.2-flash`.
 *
 * @module dsh-one-gateway/names
 */

/**
 * The canonical form of an alias or group name.
 *
 * Lower-cased and trimmed, so every stored name and every lookup agree on
 * identity. Applied on write and on lookup, never to model ids.
 *
 * @param name - whatever the caller spelled.
 * @returns the folded name; an empty string for a non-string.
 */
export function foldName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}
