"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getEntry } from "@/lib/journal";

function SavedNoteInner() {
  const params = useSearchParams();
  const entryId = params.get("entry");
  const saveFailed = params.get("save") === "failed";
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!entryId) return;
    let live = true;
    getEntry(entryId)
      .then((entry) => {
        if (live) setSaved(Boolean(entry));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [entryId]);

  if (saveFailed) {
    return <p className="mt-3 text-center text-sm text-stone-500">Couldn&apos;t save on this device — the pause still works.</p>;
  }
  if (entryId && saved) {
    return <p className="mt-3 text-center text-sm text-stone-500">Check-in saved on this device.</p>;
  }
  return null;
}

export default function SavedNote() {
  return (
    <Suspense fallback={null}>
      <SavedNoteInner />
    </Suspense>
  );
}
