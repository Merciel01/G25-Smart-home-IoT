import React from "react";
import { id } from "ethers";
import { DEVICES } from "../../../packages/shared/src/protocol";

/** Render only the gateway's authenticated state; never infer success from a click. */
export function DeviceVisual({ device: d }: { device: any }) {
  const spec = DEVICES.find((s) => id(s.model) === d.modelId);
  const kind =
    spec?.model === "G25-LOCK"
      ? "lock"
      : spec?.model === "G25-PLUG"
        ? "plug"
        : spec?.model === "G25-CAM"
          ? "camera"
          : "unknown";
  const states: Record<string, string> = {
    LOCK: "Verrouillée",
    UNLOCK: "Déverrouillée",
    ON: "Prise alimentée · lampe allumée",
    OFF: "Prise coupée · lampe éteinte",
    ACTIVATE: "Caméra active",
    DEACTIVATE: "Caméra inactive",
  };
  const compatible = spec?.actions.some(
    (a) =>
      ["LOCK", "UNLOCK", "ON", "OFF", "ACTIVATE", "DEACTIVATE"][a] === d.state,
  );
  const fresh =
    d.online && Number.isFinite(d.lastSeen) && Date.now() - d.lastSeen < 45000;
  const known = !d.revoked && fresh && compatible;
  const mode = d.revoked
    ? "revoked"
    : !fresh
      ? "offline"
      : !known
        ? "unknown"
        : d.state.toLowerCase();
  const label = d.revoked
    ? "Objet révoqué"
    : !fresh
      ? "Hors ligne · état actuel inconnu"
      : !known
        ? "État inconnu"
        : states[d.state];
  const active = known && ["LOCK", "ON", "ACTIVATE"].includes(d.state);
  return (
    <figure
      className={`device-visual ${kind} ${mode}`}
      aria-label={`Appareil simulé ${d.label}`}
      data-state={mode}
    >
      <div className="visual-scene">
        <span className="simulation-label">Simulation</span>
        <svg
          viewBox="0 0 300 165"
          role="img"
          aria-label={`${d.label} : ${label}`}
        >
          <ellipse cx="150" cy="150" rx="97" ry="7" className="visual-shadow" />
          {kind === "lock" ? (
            <>
              <rect
                x="72"
                y="18"
                width="156"
                height="128"
                rx="12"
                className="visual-body"
              />
              <path
                d={
                  known && d.state === "UNLOCK"
                    ? "M130 77V56a23 23 0 0 1 46 0"
                    : "M127 77V56a23 23 0 0 1 46 0v21"
                }
                className="lock-shackle"
              />
              <rect
                x="115"
                y="75"
                width="70"
                height="55"
                rx="10"
                className="visual-accent"
              />
              <circle cx="150" cy="96" r="6" fill="white" />
              <path d="M150 100v10" stroke="white" strokeWidth="5" />
              <circle cx="207" cy="87" r="5" className="visual-indicator" />
            </>
          ) : kind === "plug" ? (
            <>
              <rect
                x="35"
                y="57"
                width="80"
                height="86"
                rx="16"
                className="visual-body"
              />
              <circle cx="75" cy="94" r="25" className="socket-face" />
              <path d="M65 89v10m20-10v10" className="visual-stroke" />
              <circle cx="75" cy="132" r="4" className="visual-indicator" />
              <path d="M115 119c38 0 20 24 48 24h49" className="power-cable" />
              {known && active && (
                <circle cx="215" cy="66" r="45" className="lamp-glow" />
              )}
              <path
                d="M196 80a28 28 0 1 1 38 0c-8 6-9 13-9 17h-20c0-4-1-11-9-17Z"
                className="lamp-bulb"
              />
              <path
                d="M205 101h20m-20 7h20m-15 6h10"
                className="visual-stroke"
              />
              <path d="M215 116v19m-17 7h34" className="visual-stroke" />
            </>
          ) : kind === "camera" ? (
            <>
              <path d="M150 111v23m-30 7h60" className="visual-stroke" />
              <rect
                x="78"
                y="35"
                width="145"
                height="80"
                rx="23"
                className="visual-body"
              />
              <circle cx="149" cy="75" r="29" className="camera-lens" />
              <circle cx="149" cy="75" r="15" className="visual-accent" />
              <circle cx="144" cy="70" r="5" fill="white" opacity=".65" />
              <circle cx="200" cy="54" r="5" className="visual-indicator" />
              {known && !active && (
                <path d="M116 107l65-65" className="camera-disabled" />
              )}
            </>
          ) : (
            <text x="150" y="90" textAnchor="middle" fill="currentColor">
              Objet non représenté
            </text>
          )}
          {!known && (
            <g>
              <rect
                x="125"
                y="117"
                width="50"
                height="27"
                rx="9"
                fill="#52667a"
              />
              <text
                x="150"
                y="136"
                textAnchor="middle"
                fill="white"
                fontSize="22"
              >
                {d.revoked ? "×" : "?"}
              </text>
            </g>
          )}
        </svg>
      </div>
      <figcaption aria-live="polite">
        <strong>{label}</strong>
        <small>
          {known
            ? "État confirmé du simulateur via MQTT"
            : "Aucun état actuel exploitable"}
        </small>
        {d.lastSeen && (
          <small>
            Dernière présence signée :{" "}
            {new Date(d.lastSeen).toLocaleTimeString("fr")}
          </small>
        )}
        {kind === "plug" && (
          <small>La lampe virtuelle illustre l’alimentation de la prise.</small>
        )}
        {kind === "camera" && (
          <small>
            Caméra simulée · aperçu webcam local disponible sur la fiche.
          </small>
        )}
      </figcaption>
    </figure>
  );
}
