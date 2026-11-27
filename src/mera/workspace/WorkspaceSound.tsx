import { useEffect, useRef, useState } from "react";
import useSoundPreference from "./useSoundPreference";
export default function WorkspaceSound({
  orders,
  enabled = true,
}: {
  orders: any[];
  enabled?: boolean;
}) {
  const [sound, setSound] = useSoundPreference();
  const [unlocked, setUnlocked] = useState(false),
    [error, setError] = useState("");
  const context = useRef<AudioContext | null>(null),
    previous = useRef<Set<string> | null>(null);

  useEffect(
    () => () => {
      void context.current?.close().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (
      enabled &&
      sound &&
      previous.current &&
      orders.some(
        (o) => o.status === "submitted" && !previous.current!.has(o.id),
      ) &&
      context.current?.state === "running"
    ) {
      const audio = context.current,
        oscillator = audio.createOscillator(),
        gain = audio.createGain();
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.3);
    }
    previous.current = ids;
  }, [orders, sound, enabled]);
  return (
    <div className="mw-sound-preference">
      <button
        type="button"
        className="secondary"
        aria-pressed={sound}
        onClick={async () => {
          if (sound && unlocked) {
            setSound(false);
            return;
          }
          setSound(true);
          try {
            context.current ||= new AudioContext();
            await context.current.resume();
            if (context.current.state !== "running") throw Error();
            setUnlocked(true);
            setError("");
          } catch {
            setError("Tap to enable sound when your browser allows audio.");
          }
        }}
      >
        {sound && !unlocked
          ? "Tap to enable sound"
          : `New order sound ${sound ? "on" : "off"}`}
      </button>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
