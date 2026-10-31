// The Friendly Brain — Pause & Nourish's second-brain mascot
// (Bob's pick, 2026-10-31, from the animated mock): a pink rounded
// brain with a gentle bob, and a thought bubble that pops in while
// the brain is thinking — three pulsing dots while it ponders, and
// a small gold spark when the idea lands. It signifies the brain at
// work, never decoration: it appears only where the user is actually
// waiting on the brain (the talk conversation, the story interview,
// the SOS opener being composed).
//
// Inline SVG + CSS keyframes (the sb-* classes in globals.css), no
// image assets. The bubble is surface-white with a neutral stone
// border so it reads on the app's light surfaces. Reduced-motion
// users get a still brain, a static bubble, and steady dots.

export type SecondBrainState = "idle" | "listening" | "thinking" | "ready";

interface SecondBrainProps {
  state: SecondBrainState;
  /** Rendered width in px; height follows the artwork's aspect. */
  size?: number;
  className?: string;
}

export default function SecondBrain({ state, size = 108, className }: SecondBrainProps) {
  const showBubble = state === "thinking" || state === "ready";
  return (
    <span
      className={className}
      style={{ width: size, display: "inline-block", lineHeight: 0 }}
    >
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
        <g className="sb-bob">
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
          <circle cx="82" cy="102" r="3.6" fill="#40222b" />
          <circle cx="104" cy="102" r="3.6" fill="#40222b" />
          <path
            d="M86 114 Q93 120 100 114"
            stroke="#40222b"
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>
      {state === "thinking" && (
        <span className="sr-only" role="status">
          Thinking…
        </span>
      )}
    </span>
  );
}
