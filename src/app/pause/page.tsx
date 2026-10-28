import { Suspense } from "react";
import Link from "next/link";
import PauseClient from "./PauseClient";

export default function PausePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-center text-3xl font-bold tracking-tight text-stone-900">
        Pause <span className="text-base font-normal text-stone-600">— 90 seconds</span>
      </h1>
      <p className="mx-auto mt-2 max-w-md text-center leading-relaxed text-stone-600">
        You don&apos;t have to win an argument with the urge. You just have to give it ninety
        seconds of room.
      </p>
      <Suspense fallback={<p className="mt-10 text-center text-stone-600">Loading the pause…</p>}>
        <PauseClient />
      </Suspense>
    </main>
  );
}
