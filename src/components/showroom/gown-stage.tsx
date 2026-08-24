"use client";

/**
 * The client boundary for the turntable.
 *
 * The gown page is a server component and cannot itself ask for a browser-only
 * module. This is the one line of client code that can, and it keeps three.js
 * out of the server bundle exactly as `enter-atelier` does for the showroom.
 */

import dynamic from "next/dynamic";

const GownViewer = dynamic(() => import("./gown-viewer"), { ssr: false });

export function GownStage(props: {
  gown: { id: string; description: string; color: string | null };
  fallbackLabel: string;
}) {
  return <GownViewer {...props} />;
}
