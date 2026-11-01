import { useState } from 'react';

/** One item that could go on the list. */
export interface PickRow {
  key: string;
  label: string;
  /** A second line, e.g. "Adds to 100 g flour". */
  detail?: string;
  /** Covered by the store cupboard: shown apart and unticked until chosen. */
  inCupboard?: boolean;
}

/**
 * Which rows are ticked. Items to buy start ticked and cupboard staples start
 * unticked, so rows that appear later (another member's change) follow the same
 * defaults.
 */
export function useItemTicks() {
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const flip = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) { next.delete(key); } else { next.add(key); }
    return next;
  };
  return {
    /** Cupboard staples the user chose to add anyway. */
    kept,
    isTicked: (row: PickRow) => (row.inCupboard ? kept.has(row.key) : !unticked.has(row.key)),
    toggle: (row: PickRow) =>
      row.inCupboard ? setKept((prev) => flip(prev, row.key)) : setUnticked((prev) => flip(prev, row.key)),
  };
}
