"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  COMPANION_SCOPES,
  approvePairing,
  armLocalSession,
  createPairing,
  denyPairing,
  exchangePairing,
  getLocalStatus,
  pairingCopyText,
  pairingDeepLink,
  pairingQrPayload,
  renewCredential,
  revokeCredential,
  stopLocalSession,
  type CompanionScope,
  type PairingOffer,
} from "../../../companion-protocol";
import { companionStore } from "@/lib/companion";
import {
  approveMailbox,
  clearOwnerBinding,
  revokeMailboxOnServer,
  denyMailbox,
  fetchOwnerEvents,
  fetchOwnerStatus,
  loadOwnerBinding,
  postMailboxOwnerEvent,
  registerWithMailbox,
  type MailboxFeedEntry,
  type MailboxOwnerStatus,
  type OwnerBinding,
} from "@/lib/mailboxClient";

// The companion page (Component A, connector slice §2): pairing,
// owner approval, status, and arming — the PWA half of the companion
// protocol. A companion is a small app on the same phone that can
// hear an earbud press and play your cue with the screen off. That
// app is a later step; this page is the ready-for-it half, and it
// says so wherever nothing has actually reached a companion yet.

type LocalStatus = Awaited<ReturnType<typeof getLocalStatus>>;

const SCOPE_WORDS: Record<CompanionScope, { name: string; desc: string }> = {
  "session:arm": {
    name: "Arm a session",
    desc: "Start a session — a set stretch of time when the companion stays ready to help.",
  },
  "event:push": {
    name: "Send back small notes",
    desc: "Tiny event notes only — like “your cue played.” Never audio, never your journal words, never where you are.",
  },
  "status:read": {
    name: "Read the status",
    desc: "Check whether a session is armed and what the last event was. Reading changes nothing.",
  },
};

const EVENT_WORDS: Record<string, string> = {
  "session.armed": "A session was armed",
  "session.stopped": "The session stopped",
  "cue.requested": "Your cue was requested",
  "cue.played": "Your cue played",
  "moment.answered": "You answered a moment",
};

const primaryBtn =
  "rounded-full bg-[#2f5d3a] px-5 py-3 font-semibold text-white transition hover:bg-[#274c30] disabled:opacity-40";
const secondaryBtn =
  "rounded-full border border-stone-300 bg-white px-5 py-3 font-semibold text-stone-800 transition hover:border-[#2f5d3a] disabled:opacity-40";

function whenText(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CompanionPage() {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [offer, setOffer] = useState<PairingOffer | null>(null);
  const [shownToken, setShownToken] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [binding, setBinding] = useState<OwnerBinding | null>(null);
  const qrRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setBinding(loadOwnerBinding());
  }, []);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getLocalStatus(companionStore));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (offer && showQr && qrRef.current) {
      QRCode.toCanvas(qrRef.current, pairingQrPayload(offer), {
        width: 220,
        margin: 2,
      }).catch(() => {
        // The code is also shown as text; a failed drawing loses nothing.
      });
    }
  }, [offer, showQr]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setNote("");
    try {
      await fn();
    } catch (err) {
      setNote(
        err instanceof Error
          ? err.message
          : "Something went wrong — nothing was changed. Try again.",
      );
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function registerOffer(next: PairingOffer) {
    // The local pairing exists either way; registering it with the
    // mailbox is what lets the real companion app find it, poll for
    // approval, and exchange over the wire.
    try {
      setBinding(await registerWithMailbox(next));
    } catch {
      setBinding(null);
      setNote(
        "The pairing was made on this phone, but the companion link didn't answer just now. " +
          "The code still works typed in by hand — and starting over retries the link.",
      );
    }
  }

  async function startPairing() {
    await act(async () => {
      setShownToken(null);
      setRevokeArmed(false);
      setShowQr(false);
      setCopyState("idle");
      const next = await createPairing(companionStore, [...COMPANION_SCOPES]);
      setOffer(next);
      await registerOffer(next);
    });
  }

  async function restartPairing() {
    await act(async () => {
      setShowQr(false);
      setCopyState("idle");
      if (binding) await denyMailbox(binding);
      clearOwnerBinding();
      setBinding(null);
      await denyPairing(companionStore);
      const next = await createPairing(companionStore, [...COMPANION_SCOPES]);
      setOffer(next);
      await registerOffer(next);
    });
  }

  async function copyPairingDetails() {
    if (!offer) return;
    try {
      await navigator.clipboard.writeText(pairingCopyText(offer));
      setCopyState("copied");
    } catch {
      // Clipboard unavailable (or permission denied) — the code above
      // stays the fallback; nothing about the pairing changes.
      setCopyState("failed");
    }
  }

  const paired = !!status?.paired;
  const expired = status?.credentialStatus === "expired";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <Link href="/shield" className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4">
        ← Back to setup
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">Companion</h1>
      <p className="mt-2 leading-relaxed text-stone-600">
        A companion is a small app on this same phone that can hear a press on your earbuds and
        play your cue with the screen off — for the moments when the phone is in your pocket.
        The companion app is installed on this phone. This page pairs with it, takes your
        approval, and — through the live link below — arms the sessions it stays ready for.
      </p>

      {note && (
        <p className="mt-4 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
          {note}
        </p>
      )}

      {/* ---------- Setup checklist (Day 8: the gate-proven steps, in order) ---------- */}
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">
          Set up your companion (about 5 minutes, one time)
        </h2>
        <p className="mt-2 leading-relaxed text-stone-600">
          Your companion is a small second app. It listens for your headset button — even
          with the screen off — and plays your recorded cue. You set it up once. Before you
          start: install the companion app on this same phone, and have your wireless
          headset nearby.
        </p>
        <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 leading-relaxed text-stone-700">
          <li>
            <strong className="text-stone-900">
              Open the companion app and tap “Allow Notifications.”
            </strong>{" "}
            The companion cannot start watching for your headset until notifications are
            allowed. If you skip this, arming will look like it worked but nothing will
            happen.
          </li>
          <li>
            <strong className="text-stone-900">Start a pairing below, on this page.</strong>{" "}
            Tap <strong className="text-stone-900">“Open in the companion app”</strong> —
            it hands the pairing over for you. If that button has nothing to open: tap{" "}
            <strong className="text-stone-900">Copy pairing details</strong> instead,
            switch to the companion app, paste into the “Pairing link or copied text” box,
            and tap <strong className="text-stone-900">Read pasted pairing</strong>, then{" "}
            <strong className="text-stone-900">Pair</strong>.
          </li>
          <li>
            <strong className="text-stone-900">Come back here and tap Approve.</strong>{" "}
            The companion waits for this. Within a few seconds it will show{" "}
            <strong className="text-stone-900">Paired</strong>.
          </li>
          <li>
            <strong className="text-stone-900">
              Leave the companion app open on screen.
            </strong>{" "}
            In the <strong className="text-stone-900">“Companion link — live”</strong>{" "}
            panel below, tap <strong className="text-stone-900">Arm a session</strong>.
            The companion only accepts an arm while it is open and visible — this is
            normal, not an error. You will see its “Second Brain Watch — armed” notice.
          </li>
          <li>
            <strong className="text-stone-900">
              In the companion app, open “Your cue” and tap Preview cue once.
            </strong>{" "}
            You should hear your recorded cue. This also tells your phone: headset presses
            go to the companion. Skip this and the button may answer to a different app.
          </li>
          <li>
            <strong className="text-stone-900">Test it the real way.</strong> Lock the
            phone so the screen is off. Press your{" "}
            <strong className="text-stone-900">headset&apos;s play button once</strong> — a
            quick press. Your cue should play, and the panel below will show “Your cue
            played.”
          </li>
        </ol>
        <p className="mt-4 leading-relaxed text-stone-700">
          That&apos;s it. From now on: open the companion, arm from this page, and the
          button is live.
        </p>
        <h3 className="mt-5 font-semibold text-stone-900">If something doesn&apos;t work</h3>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 leading-relaxed text-stone-700">
          <li>
            <strong className="text-stone-900">Companion says “pairing not found”:</strong>{" "}
            the pairing expired before it was approved. Start over from step 2 — nothing
            is damaged, and a fresh pairing takes a minute.
          </li>
          <li>
            <strong className="text-stone-900">
              You armed, but the companion still says “not armed”:
            </strong>{" "}
            open the companion and leave it on screen for a few seconds (step 4), and check
            that notifications are allowed (step 1).
          </li>
          <li>
            <strong className="text-stone-900">Headset press does nothing:</strong> pull
            down your phone&apos;s media panel. It should show the{" "}
            <strong className="text-stone-900">Second Brain Watch</strong> player. If a
            different app is shown, go back to step 5 — one Preview cue tap hands the
            button to the companion.
          </li>
          <li>
            <strong className="text-stone-900">
              Your earbuds pop up a list of assistants (Amazon, Bixby, Google,
              Perplexity):
            </strong>{" "}
            that is the earbuds&apos; touch-and-hold action, not the companion. The cue
            listens for a plain media play press — use your headset&apos;s play button,
            one quick press.
          </li>
        </ul>
      </section>

      {/* ---------- Status card ---------- */}
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">Status</h2>
        {binding ? (
          <p className="mt-3 leading-relaxed text-stone-700">
            Your companion is connected through the live link — the{" "}
            <strong className="text-stone-900">“Companion link — live”</strong> panel just
            below shows the real status: paired, armed, and what it last reported. (This
            phone also keeps the beginnings of a practice pairing from before the link
            existed; it stays quiet while the live link is connected.)
          </p>
        ) : !status ? (
          <p className="mt-2 text-stone-600">Loading…</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2 leading-relaxed text-stone-700">
            <p className="text-lg font-medium text-stone-900">
              {!paired
                ? "Not paired"
                : status.session.armed
                  ? "Paired — session armed"
                  : expired
                    ? "Paired — credential needs renewing"
                    : "Paired"}
            </p>
            {paired && status.pairedAt && (
              <p>Paired on {whenText(status.pairedAt)}. </p>
            )}
            {paired && status.scopes.length > 0 && (
              <p>
                It can: {status.scopes.map((s) => SCOPE_WORDS[s].name.toLowerCase()).join(" · ")}.
              </p>
            )}
            {status.session.armed && status.session.armedAt && (
              <p>Armed since {whenText(status.session.armedAt)}.</p>
            )}
            {status.lastEvent ? (
              <p>
                Last event: {EVENT_WORDS[status.lastEvent.type] ?? status.lastEvent.type},{" "}
                {whenText(status.lastEvent.at)}.
              </p>
            ) : (
              paired && <p>No events yet.</p>
            )}
          </div>
        )}
      </section>

      {/* ---------- Companion link (the live mailbox) ---------- */}
      {binding && <MailboxPanel key={binding.pairingId} binding={binding} />}

      {/* ---------- Pairing ---------- */}
      {!paired && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">Pair a companion</h2>
          {!offer && !status?.hasPendingPairing && (
            <>
              <p className="mt-2 leading-relaxed text-stone-600">
                Pairing makes a one-time code. A companion uses it once to prove it&apos;s the
                one you meant to pair — after that, this app keeps only a scrambled fingerprint
                of the credential, never the credential itself.
              </p>
              <button type="button" className={`${primaryBtn} mt-4`} disabled={busy} onClick={startPairing}>
                Start pairing
              </button>
            </>
          )}

          {!offer && status?.hasPendingPairing && (
            <>
              <p className="mt-2 leading-relaxed text-stone-600">
                A pairing was started on this phone, but its code wasn&apos;t finished. Codes
                only live a few minutes — start over with a fresh one.
              </p>
              <button type="button" className={`${primaryBtn} mt-4`} disabled={busy} onClick={restartPairing}>
                Start over
              </button>
            </>
          )}

          {offer && (
            <>
              <p className="mt-2 leading-relaxed text-stone-600">
                Pairing code — good for 15 minutes, and it works exactly once:
              </p>
              <p className="mt-3 text-center text-3xl font-bold tracking-widest text-stone-900">
                {offer.exchangeCode}
              </p>
              <div className="mt-4 rounded-xl border border-stone-200 px-4 py-3">
                <p className="text-sm leading-relaxed text-stone-600">
                  All three pairing values, in plain text — if you type them into the
                  companion by hand, its form asks for each one:
                </p>
                <dl className="mt-2 flex flex-col gap-2 text-sm">
                  <div>
                    <dt className="font-semibold text-stone-900">Pairing ID</dt>
                    <dd className="break-all font-mono text-stone-800">{offer.pairingId}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-stone-900">Secret</dt>
                    <dd className="break-all font-mono text-stone-800">
                      {offer.pairingSecret}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-stone-900">Code</dt>
                    <dd className="font-mono text-stone-800">{offer.exchangeCode}</dd>
                  </div>
                </dl>
              </div>

              {/* Carriers: ONE payload (pairingPayloadFields), several
                  ways to hand it over. The companion lives on this
                  same phone, so the deep link is primary — a QR code
                  on a screen can't be scanned by the phone showing
                  it. QR is kept, demoted, for the cross-device case. */}
              <div className="mt-5 flex flex-col gap-3">
                <a
                  href={pairingDeepLink(offer)}
                  className={`${primaryBtn} inline-block text-center`}
                >
                  Open in the companion app
                </a>
                <p className="text-sm leading-relaxed text-stone-600">
                  The companion lives on this same phone, so this button is the way to hand
                  the pairing over — no camera needed. Tap it and the companion opens with
                  this pairing ready to finish. If it doesn&apos;t open, the code above can
                  be typed into the companion by hand — same pairing, same one-time use.
                </p>
                <div>
                  <button type="button" className={secondaryBtn} onClick={copyPairingDetails}>
                    {copyState === "copied" ? "Copied" : "Copy pairing details"}
                  </button>
                  {copyState === "copied" && (
                    <p className="mt-2 text-sm text-stone-600">
                      Copied — paste it into the companion to pair.
                    </p>
                  )}
                  {copyState === "failed" && (
                    <p className="mt-2 text-sm text-stone-600">
                      Copying didn&apos;t work just now — the code above works typed in by
                      hand.
                    </p>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    className="text-sm font-medium text-[#2f5d3a] underline underline-offset-4"
                    onClick={() => setShowQr((v) => !v)}
                    aria-expanded={showQr}
                  >
                    {showQr ? "Hide the QR code" : "Pairing a different device? Show a QR code"}
                  </button>
                  {showQr && (
                    <>
                      <div className="mt-3 flex justify-center">
                        <canvas ref={qrRef} aria-label="Pairing QR code" />
                      </div>
                      <p className="mt-2 text-center text-sm text-stone-600">
                        For when the companion is on another device — that device&apos;s
                        camera scans this. On this phone, the button above is the way.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {!status?.pendingApproved ? (
                <div className="mt-6">
                  <h3 className="font-semibold text-stone-900">
                    Your approval — the companion is asking to:
                  </h3>
                  <ul className="mt-3 flex flex-col gap-3">
                    {offer.requestedScopes.map((scope) => (
                      <li key={scope} className="rounded-xl border border-stone-200 px-4 py-3">
                        <p className="font-medium text-stone-900">{SCOPE_WORDS[scope].name}</p>
                        <p className="mt-1 text-sm leading-relaxed text-stone-600">
                          {SCOPE_WORDS[scope].desc}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await approvePairing(companionStore);
                          if (binding && binding.pairingId === offer.pairingId) {
                            await approveMailbox(binding);
                          }
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={secondaryBtn}
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          if (binding && binding.pairingId === offer.pairingId) {
                            await denyMailbox(binding);
                            clearOwnerBinding();
                            setBinding(null);
                          }
                          await denyPairing(companionStore);
                          setOffer(null);
                        })
                      }
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6">
                  {binding && binding.pairingId === offer.pairingId ? (
                    <>
                      <p className="leading-relaxed text-stone-600">
                        Approved — and the companion link below can see it. Hand the pairing
                        to the companion with the button above and it finishes from its side;
                        the link panel will show <em>paired</em> when it has. There is
                        nothing else to tap here — the finish happens in the companion.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="leading-relaxed text-stone-600">
                        Approved. Finishing uses the code up and makes the companion&apos;s
                        credential — you&apos;ll see it once, below.
                      </p>
                      <button
                        type="button"
                        className={`${primaryBtn} mt-3`}
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            const issued = await exchangePairing(companionStore, {
                              pairingSecret: offer.pairingSecret,
                              exchangeCode: offer.exchangeCode,
                            });
                            setShownToken(issued.rawToken);
                            setOffer(null);
                          })
                        }
                      >
                        Finish pairing
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ---------- Credential shown once (issue / renew) ---------- */}
      {shownToken && (
        <section className="mt-6 rounded-2xl border border-[#2f5d3a]/40 bg-[#e7efe3] p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">Your companion credential</h2>
          <p className="mt-2 leading-relaxed text-stone-700">
            Shown once. The companion keeps this; this app keeps only a scrambled fingerprint of
            it, so it can never be shown again. If it&apos;s ever lost, renewing makes a fresh
            one — nothing else changes.
          </p>
          <p className="mt-3 break-all rounded-xl bg-white px-4 py-3 font-mono text-sm text-stone-900">
            {shownToken}
          </p>
          <button
            type="button"
            className={`${secondaryBtn} mt-4`}
            onClick={() => setShownToken(null)}
          >
            Done — hide it
          </button>
        </section>
      )}

      {/* ---------- Session arm (local practice surface — hidden while a
          live mailbox binding exists; the link panel above carries the
          real Arm / Stop / Ask-for-my-cue controls then) ---------- */}
      {!binding && (
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">Arm a session</h2>
        {!paired ? (
          <p className="mt-2 leading-relaxed text-stone-600">
            Waiting for companion — once a companion is paired, arming a session will show up
            here, and the companion will be the one staying ready.
          </p>
        ) : expired ? (
          <>
            <p className="mt-2 leading-relaxed text-stone-600">
              This pairing&apos;s credential has expired. Nothing was erased — the pairing,
              its permissions, and its history are all still here. Renewing just gives it a
              fresh credential.
            </p>
            <button
              type="button"
              className={`${primaryBtn} mt-4`}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const renewed = await renewCredential(companionStore);
                  setShownToken(renewed.rawToken);
                })
              }
            >
              Renew the credential
            </button>
          </>
        ) : status?.session.armed ? (
          <>
            <p className="mt-2 leading-relaxed text-stone-600">
              Armed here on this phone
              {status.session.armedAt ? ` since ${whenText(status.session.armedAt)}` : ""}. This
              arm is a record on this phone — the arm the companion itself hears is the one in
              the companion link panel near the top of this page, and what it reports shows
              there.
            </p>
            <button
              type="button"
              className={`${secondaryBtn} mt-4`}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await stopLocalSession(companionStore);
                })
              }
            >
              Stop the session
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 leading-relaxed text-stone-600">
              Arming here records the session on this phone, with the time it started. The arm
              the companion hears lives in the companion link panel near the top of this page.
            </p>
            <button
              type="button"
              className={`${primaryBtn} mt-4`}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await armLocalSession(companionStore);
                })
              }
            >
              Arm a session
            </button>
          </>
        )}
      </section>
      )}

      {/* ---------- Revoke ---------- */}
      {paired && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">End this pairing</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            Revoking is the only thing that erases a pairing — the credential, the session, and
            the event notes all go, on this phone and on the companion link itself, and pairing
            again starts from the beginning.
          </p>
          {!revokeArmed ? (
            <button
              type="button"
              className={`${secondaryBtn} mt-4`}
              disabled={busy}
              onClick={() => setRevokeArmed(true)}
            >
              Revoke pairing
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-[#9a3b26] px-5 py-3 font-semibold text-white transition hover:bg-[#7f3120] disabled:opacity-40"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    // Server first (2026-11-02): the mailbox revoke
                    // is what actually retires the credential; the
                    // local clears below tidy this browser. If the
                    // server call fails, the error surfaces and the
                    // local state stays as it was.
                    if (binding) await revokeMailboxOnServer(binding);
                    await revokeCredential(companionStore);
                    clearOwnerBinding();
                    setBinding(null);
                    setShownToken(null);
                    setOffer(null);
                    setRevokeArmed(false);
                  })
                }
              >
                Yes, revoke it
              </button>
              <button
                type="button"
                className={secondaryBtn}
                disabled={busy}
                onClick={() => setRevokeArmed(false)}
              >
                Keep it
              </button>
            </div>
          )}
        </section>
      )}

      <footer className="mt-auto pt-10 text-center text-sm text-stone-600">
        <p>Wellness info only, not medical advice.</p>
      </footer>
    </main>
  );
}

// The live companion link: the mailbox the real companion app talks
// to. This panel is the owner's window on it — pairing progress, the
// arm the companion actually hears, and the feed of what it reports
// back (cue.played lands here). It polls gently while the page is
// open; closing the page stops nothing on the companion's side.
function MailboxPanel({ binding }: { binding: OwnerBinding }) {
  const [mbStatus, setMbStatus] = useState<MailboxOwnerStatus | null>(null);
  const [events, setEvents] = useState<MailboxFeedEntry[]>([]);
  const [linkDown, setLinkDown] = useState(false);
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelNote, setPanelNote] = useState("");
  const cursorRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const [s, evs] = await Promise.all([
        fetchOwnerStatus(binding),
        fetchOwnerEvents(binding, cursorRef.current),
      ]);
      setMbStatus(s);
      if (evs.length > 0) {
        cursorRef.current = evs[evs.length - 1].id;
        setEvents((prev) => [...prev, ...evs].slice(-12));
      }
      setLinkDown(false);
    } catch {
      setLinkDown(true);
    }
  }, [binding]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), 3000);
    return () => clearInterval(t);
  }, [poll]);

  async function send(type: "session.armed" | "session.stopped" | "cue.requested") {
    setPanelBusy(true);
    setPanelNote("");
    try {
      await postMailboxOwnerEvent(binding, type);
      await poll();
    } catch {
      setPanelNote("That didn't reach the companion link just now — try again.");
    } finally {
      setPanelBusy(false);
    }
  }

  const pending = mbStatus?.pendingPairing ?? null;
  const pendingExpired = !!pending && Date.parse(pending.expiresAt) < Date.now();
  const mbPaired = !!mbStatus?.paired;
  const mbExpired = mbStatus?.credentialStatus === "expired";
  const armed = !!mbStatus?.session.armed;

  function viaWords(entry: MailboxFeedEntry): string {
    const via = entry.payload?.via;
    if (via === "media-button") return " — from your headset press";
    if (via === "request") return " — from a cue request";
    return "";
  }

  return (
    <section className="mt-6 rounded-2xl border border-[#2f5d3a]/40 bg-[#f4f7f1] p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-stone-900">Companion link — live</h2>
      <p className="mt-2 leading-relaxed text-stone-600">
        The real connection to the companion app on this phone. What the companion reports
        shows here.
      </p>

      {linkDown && !mbStatus && (
        <p className="mt-3 leading-relaxed text-stone-700">
          The link isn&apos;t answering just now — it keeps retrying on its own.
        </p>
      )}
      {linkDown && mbStatus && (
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          The link missed a check just now — retrying. What&apos;s shown is the last it
          reported.
        </p>
      )}

      {mbStatus && !mbPaired && pending && !pendingExpired && (
        <p className="mt-3 leading-relaxed text-stone-700">
          {pending.approved
            ? "Approved — the companion can finish pairing now. This panel will show paired the moment it does."
            : "Waiting for the companion to open this pairing. Approve it in the pairing section below once it does."}
        </p>
      )}
      {mbStatus && !mbPaired && pendingExpired && (
        <p className="mt-3 leading-relaxed text-stone-700">
          That pairing expired before the companion finished — start a fresh one below.
        </p>
      )}
      {mbStatus && !mbPaired && !pending && (
        <p className="mt-3 leading-relaxed text-stone-700">
          No pairing is live on the link right now.
        </p>
      )}

      {mbStatus && mbPaired && (
        <div className="mt-3 flex flex-col gap-3 leading-relaxed text-stone-700">
          <p className="text-lg font-medium text-stone-900">
            {mbExpired
              ? "Paired — the companion's credential needs renewing"
              : armed
                ? "Paired — session armed on the companion"
                : "Paired"}
          </p>
          {mbStatus.pairedAt && <p>Paired on {whenText(mbStatus.pairedAt)}.</p>}
          {armed && mbStatus.session.armedAt && (
            <p>Armed since {whenText(mbStatus.session.armedAt)}.</p>
          )}
          {mbExpired ? (
            <p>
              Nothing was erased — the companion renews its credential from its own side,
              and the pairing, its permissions, and its history stay exactly as they are.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {armed ? (
                <>
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={panelBusy}
                    onClick={() => void send("session.stopped")}
                  >
                    Stop the session
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={panelBusy}
                    onClick={() => void send("cue.requested")}
                  >
                    Ask for my cue
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={panelBusy}
                  onClick={() => void send("session.armed")}
                >
                  Arm a session
                </button>
              )}
            </div>
          )}
          {panelNote && <p className="text-sm text-stone-600">{panelNote}</p>}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold text-stone-900">What the companion has reported</h3>
          <ul className="mt-2 flex flex-col gap-1 leading-relaxed text-stone-700">
            {events.map((entry) => (
              <li key={entry.id}>
                {EVENT_WORDS[entry.type] ?? entry.type}
                {viaWords(entry)} — {whenText(entry.at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
