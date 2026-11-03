// The Friendly Brain — Pause & Nourish's second-brain mascot
// (Bob's pick, 2026-10-31, from the animated mock): a pink rounded
// brain that stays visibly alive while it works — it blinks, bobs
// gently when idle, leans in with pulsing sound arcs while it is
// listening, sways while it ponders (thought bubble, three pulsing
// dots), and hops when the idea lands (gold spark in the bubble).
// Liveliness pass 2026-11-02 (Bob's ask): more movement, plus an
// optional caption line under the mascot naming what the brain is
// doing right now, the way a live companion shows its state.
// Conversation surfaces pass secondBrainCaption(state); the home
// hero passes no caption and stays clean.
//
// Inline SVG + CSS keyframes (the sb-* classes in globals.css), no
// image assets — transform/opacity only, so it stays light on any
// phone. The bubble is surface-white with a neutral stone border so
// it reads on the app's light surfaces. Reduced-motion users get a
// still brain, a static bubble, and steady dots; the caption still
// shows, because it carries information, not decoration.

export type SecondBrainState = "idle" | "listening" | "thinking" | "ready";

/** The plain line under the mascot naming what the brain is doing. */
export function secondBrainCaption(state: SecondBrainState): string {
  switch (state) {
    case "listening":
      return "Listening…";
    case "thinking":
      return "Thinking…";
    case "ready":
      return "Got it";
    default:
      return "Here when you need me";
  }
}

interface SecondBrainProps {
  state: SecondBrainState;
  /** Rendered width in px; height follows the artwork's aspect. */
  size?: number;
  className?: string;
  /**
   * Visible status line under the mascot (also the live region for
   * screen readers). Omit on decorative placements like the home
   * hero; pass secondBrainCaption(state) in conversations.
   */
  caption?: string;
}

export default function SecondBrain({ state, size = 108, className, caption }: SecondBrainProps) {
  const showBubble = state === "thinking" || state === "ready";
  const brainMotion =
    state === "listening"
      ? "sb-listen"
      : state === "thinking"
        ? "sb-ponder"
        : state === "ready"
          ? "sb-hop"
          : "sb-bob";
  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}
    >
      <span style={{ width: size, display: "block", lineHeight: 0 }}>
        <svg
          viewBox="0 0 200 175"
          style={{ width: "100%", height: "auto", display: "block" }}
          aria-hidden="true"
          focusable="false"
        >
          {showBubble && (
            <g className="sb-pop">
              <circle cx="126" cy="62" r="4" fill="#ffffff" stroke="#d6d0c4" />
              <circle cx="137" cy="48" r="6" fill="#ffffff" stroke="#d6d0c4" />
              <ellipse cx="164" cy="30" rx="27" ry="19" fill="#ffffff" stroke="#d6d0c4" />
              {state === "thinking" && (
                <>
                  <circle className="sb-dot" cx="152" cy="30" r="3.4" fill="#a8a29e" />
                  <circle
                    className="sb-dot"
                    style={{ animationDelay: "0.18s" }}
                    cx="164"
                    cy="30"
                    r="3.4"
                    fill="#a8a29e"
                  />
                  <circle
                    className="sb-dot"
                    style={{ animationDelay: "0.36s" }}
                    cx="176"
                    cy="30"
                    r="3.4"
                    fill="#a8a29e"
                  />
                </>
              )}
              {state === "ready" && (
                <path
                  className="sb-spark"
                  d="M164 16 L167 25 L176 28 L167 31 L164 40 L161 31 L152 28 L161 25 Z"
                  fill="#f5b301"
                />
              )}
            </g>
          )}
          {state === "listening" && (
            <g
              stroke="#d97b96"
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            >
              <path className="sb-wave" d="M38 90 Q31 102 38 114" />
              <path
                className="sb-wave"
                style={{ animationDelay: "0.3s" }}
                d="M30 82 Q19 102 30 122"
              />
              <path
                className="sb-wave"
                style={{ animationDelay: "0.15s" }}
                d="M148 90 Q155 102 148 114"
              />
              <path
                className="sb-wave"
                style={{ animationDelay: "0.45s" }}
                d="M156 82 Q167 102 156 122"
              />
            </g>
          )}
          <g className={brainMotion}>
            <path
              d="M88 66 C66 66 56 84 58 100 C46 108 52 128 66 130 C70 144 92 148 102 138 C120 140 132 124 124 110 C136 98 126 78 110 76 C104 68 97 66 88 66 Z"
              fill="#f2a7bb"
              stroke="#d97b96"
              strokeWidth={2.5}
            />
            <path
              d="M74 84 Q84 78 92 86 M70 108 Q80 102 88 110 M102 92 Q112 88 118 96 M96 122 Q106 118 114 124"
              stroke="#d97b96"
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            />
            <g className="sb-eyes">
              <circle cx="82" cy="102" r="3.6" fill="#40222b" />
              <circle cx="104" cy="102" r="3.6" fill="#40222b" />
            </g>
            <path
              d="M86 114 Q93 120 100 114"
              stroke="#40222b"
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </span>
      {caption !== undefined ? (
        <span
          key={caption}
          className="sb-caption mt-2 block text-center text-[13px] font-medium text-stone-500"
          style={{ maxWidth: 230 }}
          role="status"
        >
          {caption}
        </span>
      ) : (
        state === "thinking" && (
          <span className="sr-only" role="status">
            Thinking…
          </span>
        )
      )}
    </span>
  );
}
