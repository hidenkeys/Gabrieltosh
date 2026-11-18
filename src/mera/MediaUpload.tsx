import { useEffect, useId, useRef, useState } from "react";
export type UploadedMedia = {
  id: string;
  url: string;
  previewUrl: string;
  mime: string;
  width: number;
  height: number;
};
const maxBytes = 512 * 1024;
const accepted = new Set(["image/png", "image/jpeg", "image/webp"]);
export async function prepareImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!accepted.has(file.type))
    throw new Error(
      "Choose a PNG, JPEG or WebP image. SVG and HTML are not supported.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose an image smaller than 10 MB before compression.");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height)
      throw new Error("This image has invalid dimensions.");
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image processing is unavailable in this browser.");
    const mime =
      file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.45, 0.88 - attempt * 0.07);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Image compression failed.")),
          mime,
          quality,
        ),
      );
      if (blob.size <= maxBytes && accepted.has(blob.type))
        return { blob, width: canvas.width, height: canvas.height };
      scale *= 0.8;
    }
    throw new Error(
      "This image cannot fit the 512 KB limit. Try a smaller image.",
    );
  } finally {
    bitmap.close();
  }
}
export default function MediaUpload({
  endpoint,
  onUploaded,
  disabled = false,
}: {
  endpoint: string;
  onUploaded: (media: UploadedMedia) => void;
  disabled?: boolean;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [media, setMedia] = useState<UploadedMedia | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    setMedia(null);
    setError("");
    setBusy(false);
    return () => {
      generation.current++;
      activeRequest.current?.abort();
    };
  }, [endpoint]);
  async function upload(file: File) {
    const currentGeneration = generation.current;
    setBusy(true);
    setError("");
    try {
      if (
        !/^\/api\/mera\/v1\/organizations\/[a-zA-Z0-9-]+(?:\/branches\/[a-zA-Z0-9-]+)?\/assets$/.test(
          endpoint,
        )
      )
        throw new Error("Image upload needs a valid organization destination.");
      const { blob } = await prepareImage(file);
      if (generation.current !== currentGeneration) return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const controller = new AbortController(),
        timeout = setTimeout(() => controller.abort(), 15000);
      activeRequest.current = controller;
      let result: UploadedMedia;
      try {
        const startedAt = performance.now();
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-POS-Request": "1" },
          signal: controller.signal,
          body: JSON.stringify({
            filename: file.name.slice(0, 100),
            mime: blob.type,
            data: btoa(binary),
          }),
        });
        if ([401, 403].includes(response.status))
          window.dispatchEvent(
            new window.CustomEvent("mera:access-denied", {
              detail: {
                path: endpoint.replace(/^\/api\/mera\/v1/, ""),
                startedAt,
              },
            }),
          );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Image upload failed.");
        if (
          typeof data.id !== "string" ||
          data.url !== `/api/mera/v1/public/assets/${data.id}` ||
          data.previewUrl !== `${endpoint}/${data.id}`
        )
          throw new Error("The server returned an invalid image location.");
        result = data;
      } finally {
        clearTimeout(timeout);
      }
      if (generation.current !== currentGeneration) return;
      setMedia(result);
      onUploaded(result);
    } catch (e) {
      if (generation.current !== currentGeneration) return;
      setError(
        (e as Error).name === "AbortError"
          ? "Upload timed out; it may have reached the server. Check the current image before retrying."
          : (e as Error).message,
      );
    } finally {
      if (generation.current === currentGeneration) setBusy(false);
      if (generation.current === currentGeneration && input.current)
        input.current.value = "";
    }
  }
  return (
    <div className="mera-media-upload">
      <label htmlFor={id}>Upload image</label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || busy}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <p id={`${id}-help`}>
        PNG, JPEG or WebP. Photos are resized to at most 1,600 pixels and 512
        KB. PNG transparency is preserved.
      </p>
      {busy && <p role="status">Preparing and uploading image…</p>}
      {error && <p role="alert">{error}</p>}
      {media && (
        <>
          <img
            src={media.previewUrl}
            alt="Uploaded image preview"
            style={{ maxWidth: 240, maxHeight: 180, objectFit: "contain" }}
          />
          <p role="status">
            Image uploaded. Save your changes and publish the menu separately to
            make a menu image visible to customers. Uploading does not publish
            it.
          </p>
        </>
      )}
    </div>
  );
}
