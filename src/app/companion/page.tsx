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
  pairingQrPayload,
  renewCredential,
  revokeCredential,
  stopLocalSession,
  type CompanionScope,
  type PairingOffer,
} from "../../../companion-protocol";
import { companionStore } from "@/lib/companion";

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
  const qrRef = useRef<HTMLCanvasElement | null>(null);

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
    if (offer && qrRef.current) {
      QRCode.toCanvas(qrRef.current, pairingQrPayload(offer), {
        width: 220,
        margin: 2,
      }).catch(() => {
        // The code is also shown as text; a failed drawing loses nothing.
      });
    }
  }, [offer]);

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

  async function startPairing() {
    await act(async () => {
      setShownToken(null);
      setRevokeArmed(false);
      const next = await createPairing(companionStore, [...COMPANION_SCOPES]);
      setOffer(next);
    });
  }

  async function restartPairing() {
    await act(async () => {
      await denyPairing(companionStore);
      const next = await createPairing(companionStore, [...COMPANION_SCOPES]);
      setOffer(next);
    });
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
        The companion app itself is a later step. This page is the half that&apos;s ready for
        it: pairing, your approval, and the session controls, all working now, on this phone.
      </p>

      {note && (
        <p className="mt-4 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
          {note}
        </p>
      )}

      {/* ---------- Status card ---------- */}
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900">Status</h2>
        {!status ? (
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
              <div className="mt-3 flex justify-center">
                <canvas ref={qrRef} aria-label="Pairing QR code" />
              </div>
              <p className="mt-2 text-center text-sm text-stone-600">
                A companion would scan this, or type the code.
              </p>

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

      {/* ---------- Session arm ---------- */}
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
              {status.session.armedAt ? ` since ${whenText(status.session.armedAt)}` : ""}. The
              companion app that would hear about this is a later step — for now, nothing has
              confirmed on the other side, and this card won&apos;t pretend it has.
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
              Arming records the session here, with the time it started. When the companion app
              exists, this is the action that tells it to stay ready.
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

      {/* ---------- Revoke ---------- */}
      {paired && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">End this pairing</h2>
          <p className="mt-2 leading-relaxed text-stone-600">
            Revoking is the only thing that erases a pairing — the credential, the session, and
            the event notes all go, and pairing again starts from the beginning.
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
                    await revokeCredential(companionStore);
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
