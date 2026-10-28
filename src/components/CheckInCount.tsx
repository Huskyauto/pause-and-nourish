"use client";

import { useEffect, useState } from "react";
import { listEntries } from "@/lib/journal";

export default function CheckInCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    listEntries()
      .then((entries) => {
        if (live) setCount(entries.length);
      })
      .catch(() => {
        if (live) setCount(0);
      });
    return () => {
      live = false;
    };
  }, []);

  if (count === null) return null;
  return (
    <p className="mt-3 text-sm text-stone-600">
      Check-ins on this device: {count}
    </p>
  );
}
