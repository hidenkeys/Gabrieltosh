import { useEffect, useState } from "react";
const key = "mera-ticket-sound",
  event = "mera-sound-preference";
const read = () => {
  try {
    return window.localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
};
export default function useSoundPreference(): [
  boolean,
  (value: boolean) => void,
] {
  const [sound, setSound] = useState(read);
  useEffect(() => {
    const changed = () => setSound(read());
    window.addEventListener(event, changed);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener(event, changed);
      window.removeEventListener("storage", changed);
    };
  }, []);
  return [
    sound,
    (value) => {
      setSound(value);
      try {
        window.localStorage.setItem(key, value ? "on" : "off");
        window.dispatchEvent(new Event(event));
      } catch {}
    },
  ];
}
