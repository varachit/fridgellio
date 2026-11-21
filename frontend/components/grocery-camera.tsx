"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useText } from "./ui";

export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight)
    throw new ApiError("camera_frame_unavailable");
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1920 / Math.max(videoWidth, videoHeight));
  canvas.width = Math.max(1, Math.round(videoWidth * scale));
  canvas.height = Math.max(1, Math.round(videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new ApiError("camera_frame_unavailable");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const photo = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });
  if (!photo) throw new ApiError("camera_frame_unavailable");
  return photo;
}

export type CameraSession = {
  video: HTMLVideoElement;
  signal: AbortSignal;
  stop: () => void;
};

export function CameraPreview({
  onReady,
  failed,
}: {
  onReady: (session: CameraSession) => void;
  failed: (code: string) => void;
}) {
  const { t } = useText();
  const video = useRef<HTMLVideoElement>(null);
  const ready = useEffectEvent(onReady);
  const fail = useEffectEvent(failed);
  useEffect(() => {
    const preview = video.current!;
    const controller = new AbortController();
    const { signal } = controller;
    let stream: MediaStream | undefined;

    function stop() {
      controller.abort();
      stream?.getTracks().forEach((track) => track.stop());
      preview.srcObject = null;
    }
    function unavailable() {
      if (signal.aborted) return;
      stop();
      fail(window.isSecureContext ? "camera" : "camera_https");
    }
    async function open() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      for (const track of stream.getVideoTracks()) {
        track.addEventListener("ended", unavailable, { signal });
      }
      preview.srcObject = stream;
      await preview.play();
      if (!signal.aborted) ready({ video: preview, signal, stop });
    }
    open().catch(unavailable);
    return stop;
  }, []);

  return (
    <video
      className="camera-preview"
      aria-label={t("Camera preview", "ภาพจากกล้อง")}
      ref={video}
      autoPlay
      playsInline
      muted
    />
  );
}

function PhotoCamera({
  taken,
  failed,
  cancel,
}: {
  taken: (photo: Blob) => void;
  failed: (code: string) => void;
  cancel: () => void;
}) {
  const { t } = useText();
  const [session, setSession] = useState<CameraSession | null>(null);
  const [capturing, setCapturing] = useState(false);

  async function takePhoto() {
    if (!session || session.signal.aborted || capturing) return;
    setCapturing(true);
    try {
      const photo = await captureFrame(session.video);
      if (session.signal.aborted) return;
      session.stop();
      taken(photo);
    } catch {
      if (!session.signal.aborted) failed("camera_frame_unavailable");
    }
  }
  return (
    <>
      <CameraPreview onReady={setSession} failed={failed} />
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!session || capturing}
          onClick={takePhoto}
        >
          {!session
            ? t("Opening camera…", "กำลังเปิดกล้อง…")
            : capturing
              ? t("Taking photo…", "กำลังถ่ายภาพ…")
              : t("Take photo", "ถ่ายภาพ")}
        </button>
        <button type="button" className="secondary" onClick={cancel}>
          {t("Cancel", "ยกเลิก")}
        </button>
      </div>
    </>
  );
}

export function GroceryPhoto({
  analyze,
  busy,
  setError,
}: {
  analyze: (photo: File) => void;
  busy: boolean;
  setError: (code: string | null) => void;
}) {
  const { t } = useText();
  const picker = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<{
    file: File;
    url: string;
    captured: boolean;
  } | null>(null);
  useEffect(() => {
    if (photo) return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  function preview(file: File, captured: boolean) {
    setError(null);
    setPhoto({ file, url: URL.createObjectURL(file), captured });
    setCameraOpen(false);
  }

  return (
    <fieldset disabled={busy} aria-label={t("Grocery photo", "ภาพถ่ายของสด")}>
      {cameraOpen ? (
        <PhotoCamera
          taken={(blob) =>
            preview(
              new File([blob], "groceries.jpg", { type: blob.type }),
              true,
            )
          }
          failed={(code) => {
            setCameraOpen(false);
            setError(code);
          }}
          cancel={() => setCameraOpen(false)}
        />
      ) : (
        <>
          {photo && (
            <img
              className="camera-preview"
              src={photo.url}
              alt={t("Grocery photo preview", "ตัวอย่างภาพถ่ายของสด")}
              onError={() => {
                setPhoto(null);
                setError("invalid_photo");
              }}
            />
          )}
          <div className="actions">
            {photo && (
              <button
                type="button"
                className="primary"
                onClick={() => analyze(photo.file)}
              >
                {busy
                  ? t("Analyzing photo…", "กำลังวิเคราะห์ภาพ…")
                  : t("Analyze photo", "วิเคราะห์รูป")}
              </button>
            )}
            <button
              type="button"
              className={photo ? "secondary" : "primary"}
              onClick={() => {
                setError(null);
                setCameraOpen(true);
              }}
            >
              {photo?.captured
                ? t("Retake photo", "ถ่ายใหม่")
                : t("Open camera", "เปิดกล้อง")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => picker.current?.click()}
            >
              {t("Choose image", "เลือกรูปภาพ")}
            </button>
          </div>
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            aria-label={t("Choose image", "เลือกรูปภาพ")}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) preview(file, false);
            }}
          />
        </>
      )}
    </fieldset>
  );
}
