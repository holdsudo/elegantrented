"use client";

/**
 * The door into the collection.
 *
 * Kept separate so the lookbook itself is only fetched when someone asks for
 * it, the same discipline the atelier uses. Unlike the atelier there is nothing
 * to feature-detect: this is images and CSS, so there is no context to be
 * refused and no device that cannot show it.
 */

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { ShowroomGown } from "./atelier";

const Lookbook = dynamic(() => import("./lookbook"), { ssr: false });

export function EnterLookbook({
  gowns,
  dateQuery
}: {
  gowns: ShowroomGown[];
  dateQuery: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (gowns.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="btn-lux enter-lookbook"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void import("./lookbook")}
        onFocus={() => void import("./lookbook")}
      >
        Step inside
      </button>

      {open ? <Lookbook gowns={gowns} dateQuery={dateQuery} onExit={close} /> : null}
    </>
  );
}
