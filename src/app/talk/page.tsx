import Link from "next/link";
import TalkClient from "./TalkClient";

export default function TalkPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-center text-3xl font-bold tracking-tight text-stone-900">
        Talk it through
      </h1>
      <p className="mx-auto mt-2 max-w-md text-center leading-relaxed text-stone-600">
        A conversation, not a form. Your second brain asks — you answer out loud — and it deals
        your own plan back to you.
      </p>
      <TalkClient />
      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
