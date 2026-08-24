/**
 * One gown, as the storefront's collection views need it.
 *
 * Assembled on the server in `/browse` from the same rows the catalogue below
 * it lists, so the lookbook and the grid can never show different collections.
 * It carries the photograph's URL rather than the photograph, because whether a
 * gown has been shot yet is the single fact those views branch on.
 */
export type CollectionGown = {
  id: string;
  number: string;
  description: string;
  color: string | null;
  size: string | null;
  /** Already formatted in the shop's own currency. */
  price: string;
  /** Set once the shop has photographed this gown. */
  photoUrl: string | null;
  /** Whether it is free on the date the visitor asked about, if they asked. */
  availability: "free" | "taken" | "unknown";
};
