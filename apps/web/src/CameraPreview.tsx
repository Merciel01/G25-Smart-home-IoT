import React, { useEffect, useRef, useState } from "react";

/** Browser-local preview: media is never uploaded, persisted or sent over MQTT. */
export function CameraPreview({ device }: { device: any }) {
  const active =
    !device.revoked &&
    device.online &&
    device.state === "ACTIVATE" &&
    Number.isFinite(device.lastSeen) &&
    Date.now() - device.lastSeen < 45000;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [status, setStatus] = useState("stopped");
  const [error, setError] = useState("");
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    stop();
    setStatus("stopped");
    setError("");
    return stop;
  }, [active, device.id]);
  useEffect(() => {
    // Expire the preview even if the API stops responding and no new props arrive.
    const timer = window.setInterval(() => {
      if (
        !Number.isFinite(device.lastSeen) ||
        Date.now() - device.lastSeen >= 45000
      ) {
        stop();
        setStatus("stopped");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [device.lastSeen]);
  async function start() {
    if (!active || status === "requesting") return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "Webcam indisponible : ouvrez l’application sur localhost ou en HTTPS avec un navigateur compatible.",
      );
      return;
    }
    const current = ++generation.current;
    setStatus("requesting");
    setError("");
    let media: MediaStream | null = null;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (current !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      for (const track of media.getTracks())
        track.addEventListener("ended", () => {
          if (stream.current === media) {
            stop();
            setStatus("stopped");
            setError("La webcam a été arrêtée ou déconnectée.");
          }
        });
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      if (current === generation.current) setStatus("playing");
    } catch (e: any) {
      media?.getTracks().forEach((track) => track.stop());
      if (current !== generation.current) return;
      stop();
      setStatus("stopped");
      setError(
        e.name === "NotAllowedError"
          ? "Accès à la webcam refusé. Autorisez la caméra dans les paramètres du site, puis réessayez."
          : e.name === "NotFoundError"
            ? "Aucune webcam détectée sur cet ordinateur."
            : e.name === "NotReadableError"
              ? "La webcam est occupée ou inaccessible. Fermez les autres applications qui l’utilisent."
              : "Impossible de démarrer la webcam. Réessayez après avoir vérifié ses autorisations.",
      );
    }
  }
  return (
    <section className="camera-preview" aria-label="Webcam locale">
      <h3>Webcam de cet ordinateur</h3>
      <p>
        Aperçu local uniquement : aucun son, enregistrement ou envoi au serveur.
        Cette webcam illustre CAM-01 ; elle ne constitue pas une caméra distante
        du Raspberry Pi.
      </p>
      {!active && (
        <p>
          Activez la caméra et attendez la confirmation du simulateur pour
          ouvrir la webcam.
        </p>
      )}
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        hidden={status !== "playing"}
        aria-label="Vidéo en direct de la webcam locale"
      />
      <p role="status">
        {status === "playing"
          ? "Webcam en direct · aperçu local"
          : status === "requesting"
            ? "Autorisation de la webcam en attente…"
            : "Webcam arrêtée"}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button
          disabled={!active || status !== "stopped"}
          onClick={() => void start()}
        >
          Ouvrir la webcam
        </button>
        {status !== "stopped" && (
          <button
            className="secondary"
            onClick={() => {
              stop();
              setStatus("stopped");
            }}
          >
            Arrêter l’aperçu
          </button>
        )}
      </div>
    </section>
  );
}
