"use client";

/**
 * The door into the showroom.
 *
 * Kept separate from the showroom itself so that the heavy part — three.js and
 * the room — is only fetched when someone actually asks to go in. The button is
 * a few hundred bytes; the room behind it is not, and a visitor who came to
 * check one gown's price on a phone should never pay for it.
 *
 * If WebGL is missing or the room fails to build, this component stands down
 * permanently and says so once. The catalogue below is the real page and is
 * always there, so there is nothing to rescue and nothing to apologise for.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { ShowroomGown } from "./atelier";

const Showroom = dynamic(() => import("./showroom"), { ssr: false });

type Props = {
  gowns: ShowroomGown[];
  dateQuery: string;
};

/**
 * Can this browser draw the room at all?
 *
 * Only the questions that can be answered honestly and cheaply: is there a
 * WebGL context to be had. Whether it will be *fast* is not knowable here, and
 * guessing from the user agent would be wrong more often than right — the
 * renderer measures its own frame rate instead.
 */
function canRender(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ??
        canvas.getContext("webgl") ??
        canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

export function EnterAtelier({ gowns, dateQuery }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSupported(canRender());
  }, []);

  const onUnsupported = useCallback(() => {
    setSupported(false);
    setOpen(false);
  }, []);

  const onExit = useCallback(() => setOpen(false), []);

  // Nothing to enter, and nothing worth saying about it — the catalogue is
  // directly below and is the same collection.
  if (supported === false || gowns.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="btn-lux enter-atelier"
        onClick={() => setOpen(true)}
        // Start fetching the room on intent rather than on click, so the door
        // opens on the beat instead of after it.
        onPointerEnter={() => void import("./showroom")}
        onFocus={() => void import("./showroom")}
      >
        <span className="ea-glyph" aria-hidden="true" />
        Walk the atelier
      </button>

      {open ? (
        <Showroom
          gowns={gowns}
          dateQuery={dateQuery}
          onExit={onExit}
          onUnsupported={onUnsupported}
        />
      ) : null}
    </>
  );
}
