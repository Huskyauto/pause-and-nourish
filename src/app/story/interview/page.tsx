import Link from "next/link";
import InterviewClient from "./InterviewClient";

export default function StoryInterviewPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back
      </Link>
      <h1 className="mt-4 text-center text-3xl font-bold tracking-tight text-stone-900">
        Your story
      </h1>
      <p className="mx-auto mt-2 max-w-md text-center leading-relaxed text-stone-600">
        No form. Your second brain asks a few questions, one at a time, and you answer out loud.
        What you say becomes the story it deals back to you — in your words, on your device.
      </p>
      <InterviewClient />
      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}
