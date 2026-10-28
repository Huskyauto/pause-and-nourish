import Link from "next/link";
import PauseTimer from "./PauseTimer";
import SavedNote from "./SavedNote";

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
        You don&apos;t have to win an argument with the urge. You just have
        to give it ninety seconds of room.
      </p>
      <SavedNote />

      <div className="mt-10">
        <PauseTimer />
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/dashboard"
          className="inline-block rounded-full bg-[#2f5d3a] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#274c30]"
        >
          Continue to Choose →
        </Link>
        <p className="mt-3 text-sm text-stone-600">
          Eat, swap, or delay — all three are fine. The dashboard and the
          Choose step arrive with the Day 4 build.
        </p>
      </div>
    </main>
  );
}
