"use client";
import { useSyncExternalStore } from "react";
import { subscribeMeasured, isMeasured } from "./track";
import { setChoice } from "./consent";

/** Footer link: forget the stored choice, which brings the banner back. Only on measured visits. */
export function CookieSettingsLink({ className, after }: { className?: string; after?: string }) {
  const measured = useSyncExternalStore(subscribeMeasured, isMeasured, () => false);
  if (!measured) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => {
          setChoice(null);
        }}>
        Cookie settings
      </button>
      {after}
    </>
  );
}
