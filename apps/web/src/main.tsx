import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";
import {
  BrowserProvider,
  Contract,
  id,
  isAddress,
  hexlify,
  randomBytes,
  sha256,
  ZeroAddress,
} from "ethers";
import {
  ACTIONS,
  DEVICES,
  deviceId,
  homeDomain,
  installTypes,
  manifestTypes,
  firmwareDomain,
} from "../../../packages/shared/src/protocol";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./style.css";
import { DeviceVisual } from "./DeviceVisual";
import { CameraPreview } from "./CameraPreview";
declare global {
  interface Window {
    ethereum?: any;
  }
}
const API = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001";
const titles: Record<string, string> = {
  "/": "Bonjour",
  "/connect": "Connexion portefeuille",
  "/setup": "Comptes et configuration",
  "/devices": "Objets connectés",
  "/devices/new": "Enregistrer un objet",
  "/permissions": "Permissions",
  "/permissions/new": "Accorder une permission",
  "/commands": "Commandes",
  "/firmware": "Micrologiciels",
  "/security": "Centre de sécurité",
  "/audit": "Journal d’activité",
  "/infrastructure": "Infrastructure",
  "/guest": "Mon accès invité",
  "/manufacturer": "Espace fabricant",
  "/manufacturer/firmware/new": "Publier une version",
  "/demo": "Guide et démonstration",
};
const labels = [
  "Verrouiller",
  "Déverrouiller",
  "Allumer",
  "Éteindre",
  "Activer",
  "Désactiver",
];
const short = (s: string) =>
  s.length > 18 ? s.slice(0, 8) + "…" + s.slice(-6) : s;
function Hash({ value }: { value: string }) {
  return (
    <span className="hash" title={value}>
      <code>{value}</code>
      <button
        className="secondary"
        aria-label="Copier l’identifiant"
        onClick={() => void navigator.clipboard.writeText(value)}
      >
        Copier
      </button>
    </span>
  );
}
function Registration({
  run,
  tx,
  navigate,
  busy,
  provisioning,
  api,
  automaticProvisioning,
}: {
  provisioning?: any[];
  api: any;
  automaticProvisioning: boolean;
  run: any;
  tx: any;
  navigate: any;
  busy: any;
}) {
  const [deviceName, setDeviceName] = useState("");
  const [model, setModel] = useState("G25-LOCK");
  const [labelValue, setLabelValue] = useState("");
  const [signerValue, setSignerValue] = useState("");
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run("Enregistrement", async () => {
          const label = String(f.get("label")).trim().toUpperCase(),
            address = String(f.get("signer"));
          if (!isAddress(address))
            throw Error(
              "Adresse d’objet invalide : utilisez l’adresse publique complète fournie pour cet objet.",
            );
          const expected =
            provisioning?.find((d) => d.label === label) ??
            DEVICES.find((d) => d.label === label);
          if (!expected)
            throw Error(
              "Créez d’abord une identité avec le bouton Préparer cet appareil, ou choisissez un objet provisionné disponible.",
            );
          const provisioned = provisioning?.find((d) => d.label === label);
          if (
            provisioned &&
            !provisioned.registered &&
            provisioned.signer &&
            provisioned.signer.toLowerCase() !== address.toLowerCase()
          )
            throw Error(
              "Adresse incorrecte pour cet objet : choisissez son identité provisionnée dans la liste.",
            );
          if (expected && expected.model !== String(f.get("model")))
            throw Error(
              `WRONG_MODEL : pour ${label}, sélectionnez le modèle ${expected.model}.`,
            );
          await tx("registerDevice", [
            deviceId(label),
            address,
            id(String(f.get("model"))),
          ]);
          navigate("/devices");
        });
      }}
    >
      <p>
        Le compte connecté devient propriétaire de l’objet lors de cet
        enregistrement.
      </p>
      <Link to="/setup">
        Voir les objets disponibles et leurs propriétaires
      </Link>
      {automaticProvisioning && (
        <fieldset>
          <legend>Ajouter mon appareil simulé</legend>
          <label>
            Nom de mon appareil
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              maxLength={64}
              placeholder="Serrure de mon bureau"
            />
          </label>
          <label>
            Type d’appareil
            <select
              aria-label="Type d’appareil à préparer"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {DEVICES.map((d) => (
                <option key={d.model}>{d.model}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!!busy || !deviceName.trim()}
            onClick={() =>
              void run("Provisionnement", async () => {
                const d = await api("/provision", {
                  method: "POST",
                  body: JSON.stringify({ model, name: deviceName.trim() }),
                });
                setLabelValue(d.label);
                setModel(d.model);
                setSignerValue(d.signer);
              })
            }
          >
            Préparer cet appareil
          </button>
          <p>
            Une identité unique est créée automatiquement. Confirmez ensuite son
            enregistrement avec votre portefeuille pour en devenir propriétaire.
            Une transaction annulée laisse l’identité disponible pour réessayer.
          </p>
        </fieldset>
      )}
      {provisioning
        ?.filter((d) => d.provisioningStatus === "pending")
        .map((d) => (
          <div key={d.id}>
            <p>Préparation MQTT à terminer : {d.name ?? d.label}</p>
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                void run("Reprise du provisionnement", async () => {
                  const result = await api(`/provision/${d.id}/retry`, {
                    method: "POST",
                  });
                  setLabelValue(result.label);
                  setModel(result.model);
                  setSignerValue(result.signer);
                })
              }
            >
              Réessayer la préparation de {d.label}
            </button>
          </div>
        ))}
      {provisioning?.some((d) => !d.registered && d.signer) && (
        <label>
          Objet provisionné disponible
          <select
            aria-label="Objet provisionné disponible"
            defaultValue=""
            onChange={(e) => {
              const d = provisioning.find((d) => d.id === e.target.value);
              if (d) {
                setLabelValue(d.label);
                setModel(d.model);
                setSignerValue(d.signer);
              }
            }}
          >
            <option value="">Choisir un objet</option>
            {provisioning
              .filter((d) => !d.registered && d.signer)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.model}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        Identifiant normalisé
        <input
          name="label"
          value={labelValue}
          required
          pattern="[A-Za-z0-9-]{3,32}"
          placeholder="LOCK-01"
          onChange={(e) => {
            setLabelValue(e.target.value);
            const expected = DEVICES.find(
              (d) => d.label === e.target.value.trim().toUpperCase(),
            );
            if (expected) setModel(expected.model);
          }}
        />
      </label>
      <label>
        Modèle
        <select
          name="model"
          aria-label="Modèle"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {DEVICES.map((d) => (
            <option key={d.model}>{d.model}</option>
          ))}
        </select>
      </label>
      <label>
        Adresse publique provisionnée par le simulateur
        <input
          name="signer"
          value={signerValue}
          onChange={(e) => setSignerValue(e.target.value)}
          required
          placeholder="0x…"
        />
      </label>
      <p>
        Chaque objet possède une identité distincte. Sa clé privée reste dans le
        simulateur.
      </p>
      <button disabled={!!busy}>Enregistrer sur chaîne</button>
    </form>
  );
}
function PermissionForm({
  ownerDevices,
  devices,
  run,
  tx,
  navigate,
  busy,
}: {
  ownerDevices: any[];
  devices: any[];
  run: any;
  tx: any;
  navigate: any;
  busy: any;
}) {
  const [chosen, setChosen] = useState(ownerDevices[0]?.id ?? "");
  const d = devices.find((d) => d.id === chosen);
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run("Permission", async () => {
          const user = String(f.get("user"));
          if (!isAddress(user)) throw Error("Bénéficiaire invalide");
          const expires = Math.floor(
            new Date(String(f.get("expires"))).getTime() / 1000,
          );
          const actions = f.getAll("actions").map(Number);
          if (
            !actions.length ||
            !Number.isSafeInteger(expires) ||
            expires <= Date.now() / 1000
          )
            throw Error("Choisissez une action et une expiration future");
          await tx("grantPermission", [
            chosen,
            user,
            actions.reduce((v, a) => v | (1 << a), 0),
            expires,
          ]);
          navigate("/permissions");
        });
      }}
    >
      <label>
        Objet
        <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
          {ownerDevices
            .filter((d) => !d.revoked)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Adresse bénéficiaire
        <input name="user" required placeholder="0x…" />
      </label>
      <fieldset>
        <legend>Actions accordées (remplacent les droits précédents)</legend>
        {d?.actions.map((a: number) => (
          <label className="check" key={a}>
            <input type="checkbox" name="actions" value={a} />
            {labels[a]}
          </label>
        ))}
      </fieldset>
      <label>
        Expiration — heure de votre navigateur
        <input type="datetime-local" name="expires" required />
      </label>
      <p>
        La validité est contrôlée avec l’heure du bloc. Affichage du journal :
        Africa/Kinshasa.
      </p>
      <button disabled={!!busy || !chosen}>Accorder l’accès temporaire</button>
    </form>
  );
}
function Publish({
  models,
  run,
  api,
  signer,
  tx,
  config,
  setCatalog,
  navigate,
  busy,
  setBusy,
}: {
  models: any[];
  run: any;
  api: any;
  signer: any;
  tx: any;
  config: any;
  setCatalog: any;
  navigate: any;
  busy: any;
  setBusy: any;
}) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void run("Téléversement du fichier inerte", async () => {
          if (!file || file.size > 1048576)
            throw Error("Fichier requis, maximum 1 Mio");
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (const b of bytes) binary += String.fromCharCode(b);
          const upload = await api("/firmware/upload", {
            method: "POST",
            body: JSON.stringify({
              modelId: data.get("model"),
              bytes: btoa(binary),
            }),
          });
          if (upload.sha256Digest !== sha256(bytes))
            throw Error("HASH_MISMATCH");
          const version = Number(data.get("version"));
          const manifest = {
            modelId: upload.modelId,
            version,
            sha256Digest: upload.sha256Digest,
            cidHash: upload.cidHash,
            fileSize: upload.fileSize,
            manufacturer: upload.manufacturer,
          };
          const s = await signer();
          setBusy("Signature du manifeste fabricant");
          const signature = await s.signTypedData(
            firmwareDomain(config.chainId, config.firmwareRegistry),
            manifestTypes,
            manifest,
          );
          await tx("publishFirmware", [manifest, upload.cid, signature], true);
          setCatalog({});
          navigate("/firmware");
        });
      }}
    >
      <label>
        Modèle autorisé
        <select name="model" aria-label="Modèle du fabricant">
          {models.map((m) => (
            <option value={m} key={m}>
              {DEVICES.find((d) => id(d.model) === m)?.model ?? m}
            </option>
          ))}
        </select>
      </label>
      <label>
        Version monotone (10000 = 1.0.0 ; 10100 = 1.1.0)
        <input
          name="version"
          type="number"
          min="1"
          max="9007199254740991"
          required
        />
      </label>
      <label>
        Micrologiciel de démonstration (inerte)
        <input
          type="file"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <p>
        Étapes : empreinte SHA-256 → IPFS → signature EIP-712 → publication sur
        chaîne. Le contenu ne sera jamais exécuté.
      </p>
      <button disabled={!!busy || !models.length}>Signer et publier</button>
    </form>
  );
}

function App() {
  const generation = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>(null),
    [requests, setRequests] = useState<any[]>([]),
    [onboarding, setOnboarding] = useState<any>(null),
    [account, setAccount] = useState(""),
    [token, setToken] = useState(""),
    [devices, setDevices] = useState<any[]>([]),
    [models, setModels] = useState<string[]>([]),
    [commands, setCommands] = useState<any[]>([]),
    [permissions, setPermissions] = useState<any[]>([]),
    [audit, setAudit] = useState<any[]>([]),
    [infra, setInfra] = useState<any>(null),
    [installations, setInstallations] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [menu, setMenu] = useState(false),
    [loaded, setLoaded] = useState(false),
    [catalog, setCatalog] = useState<Record<string, any[]>>({}),
    [page, setPage] = useState(0),
    [eventFilter, setEventFilter] = useState("");
  async function api(path: string, init: RequestInit = {}) {
    const r = await fetch(API + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 204) return null;
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        reset();
      }
      throw Error(data.message ?? data.code ?? "Passerelle indisponible");
    }
    return data;
  }
  const reset = () => {
    generation.current++;
    setRequests([]);
    setOnboarding(null);
    setAccount("");
    setToken("");
    setDevices([]);
    setCommands([]);
    setPermissions([]);
    setAudit([]);
    setModels([]);
    setInstallations([]);
    setCatalog({});
    setLoaded(false);
  };
  useEffect(() => {
    void api("/public-config")
      .then(setConfig)
      .catch(() => setError("GATEWAY_UNAVAILABLE : passerelle indisponible"));
    const change = () => {
      reset();
      setError("Compte ou réseau modifié : reconnectez votre portefeuille.");
    };
    window.ethereum?.on?.("accountsChanged", change);
    window.ethereum?.on?.("chainChanged", change);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", change);
      window.ethereum?.removeListener?.("chainChanged", change);
    };
  }, []);
  useEffect(() => {
    setMenu(false);
    setPage(0);
    setEventFilter("");
  }, [location.pathname]);
  async function refresh() {
    const started = generation.current;
    try {
      const health = await api("/infrastructure");
      setInfra(health);
      if (!token) return;
      const [d, c, p, a, i, onboardingData, accessRequests] = await Promise.all(
        [
          api("/devices"),
          api("/commands?limit=100"),
          api("/permissions"),
          api("/audit?limit=100"),
          api("/installations"),
          api("/onboarding"),
          api("/access-requests"),
        ],
      );
      if (started !== generation.current) return;
      setRequests(accessRequests);
      setOnboarding(onboardingData);
      setDevices(d.devices);
      setModels(d.manufacturerModels);
      setCommands(c.items);
      setPermissions(p);
      setAudit(a.items);
      setInstallations(i);
      setLoaded(true);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [token]);
  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(
        e.code === 4001 || e.code === "ACTION_REJECTED"
          ? "SIGNATURE_REJECTED : signature annulée."
          : e.name === "TimeoutError" ||
              e.name === "AbortError" ||
              e.name === "TypeError"
            ? "GATEWAY_UNAVAILABLE : service indisponible ou délai dépassé."
            : e.shortMessage
              ? ((
                  {
                    PermissionDenied:
                      "PERMISSION_DENIED : action non autorisée.",
                    DeviceRevoked:
                      "DEVICE_REVOKED : cet objet est définitivement révoqué.",
                    InvalidInput:
                      "INVALID_INPUT : paramètres ou échéance invalides.",
                    UnauthorizedManufacturer:
                      "PERMISSION_DENIED : fabricant non autorisé.",
                  } as Record<string, string>
                )[e.revert?.name] ??
                "Opération refusée par le contrat ou le portefeuille. Vérifiez les droits, le réseau et l’expiration.")
              : (e.message ?? "Opération refusée."),
      );
    } finally {
      setBusy("");
    }
  }
  async function signer() {
    if (!window.ethereum)
      throw Error(
        "WALLET_REQUIRED : installez un portefeuille compatible MetaMask.",
      );
    const p = new BrowserProvider(window.ethereum);
    if (!config) throw Error("GATEWAY_UNAVAILABLE");
    if (Number((await p.getNetwork()).chainId) !== config.chainId)
      throw Error(
        "WRONG_NETWORK : sélectionnez " +
          (config.chainId === 31337
            ? "Hardhat local (31337)"
            : "Sepolia (11155111)"),
      );
    return p.getSigner();
  }
  async function connect() {
    await run("Connexion et signature de session", async () => {
      const s = await signer();
      const address = await s.getAddress();
      const challenge = await api("/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address }),
      });
      const signature = await s.signMessage(challenge.message);
      const session = await api("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message: challenge.message, signature }),
      });
      setAccount(address);
      setToken(session.token);
    });
  }
  async function tx(method: string, args: any[], firmware = false) {
    const s = await signer();
    if ((await s.getAddress()).toLowerCase() !== account.toLowerCase())
      throw Error("Compte modifié : reconnectez-vous");
    const contract = new Contract(
      firmware ? config.firmwareRegistry : config.registry,
      firmware ? config.firmwareAbi : config.abi,
      s,
    );
    if (method === "registerDevice") {
      setBusy("Vérification de l’identité de l’objet");
      const existing = await contract.getDevice(args[0]);
      if (existing.owner !== ZeroAddress)
        throw Error(
          "DEVICE_ALREADY_REGISTERED : cet objet est déjà enregistré. Pour l’utiliser, demandez une permission à son propriétaire. Une nouvelle adresse ne permet pas de réenregistrer le même identifiant.",
        );
      if (await contract.signerUsed(args[1]))
        throw Error(
          "DEVICE_SIGNER_ALREADY_USED : cette adresse est déjà associée à un objet. Utilisez une nouvelle identité provisionnée pour un nouvel objet.",
        );
      if (args[1].toLowerCase() === account.toLowerCase())
        throw Error(
          "INVALID_DEVICE_SIGNER : l’adresse de l’objet doit être différente de celle de votre portefeuille.",
        );
      if ((await s.provider!.getBalance(account)) === 0n)
        throw Error(
          "INSUFFICIENT_TEST_FUNDS : votre portefeuille ne possède pas d’ETH de test sur ce réseau. Aucun achat n’est nécessaire pour la démonstration locale.",
        );
    }
    if ((await s.provider!.getBalance(account)) === 0n)
      throw Error(
        "INSUFFICIENT_TEST_FUNDS : solde d’ETH de test insuffisant pour envoyer une transaction sur ce réseau. En local, utilisez local:fund ; sur Sepolia, utilisez un faucet de test.",
      );
    setBusy("Signature dans le portefeuille");
    const sent = await contract[method](...args);
    setBusy("Transaction soumise : " + short(sent.hash));
    await sent.wait();
    setBusy("Transaction confirmée ; indexation en cours");
  }
  async function command(d: any, action: number) {
    if (
      !window.confirm(
        `${labels[action]} : ${d.name} (${d.label}) ? La transaction crée une demande, l’exécution nécessite un accusé signé.`,
      )
    )
      return;
    await run("Préparation", async () => {
      const s = await signer();
      const block = await s.provider!.getBlock("latest");
      await tx("requestCommand", [
        d.id,
        action,
        Math.max(block!.timestamp, Math.floor(Date.now() / 1000)) + 120,
      ]);
      navigate("/commands");
    });
  }
  const ownerDevices = devices.filter((d) => d.isOwner);
  const isOwner = ownerDevices.length > 0;
  const isManufacturer = models.length > 0;
  const currentId = location.pathname.split("/")[2];
  const selected = devices.find((d) => d.id === currentId);
  const isFirmwareDetail =
    location.pathname.startsWith("/devices/") &&
    location.pathname.endsWith("/firmware");
  async function loadCatalog(model: string) {
    await run("Chargement des versions", async () => {
      const versions = await api("/firmware/" + model);
      setCatalog((v) => ({ ...v, [model]: versions }));
    });
  }
  function DeviceCard({ d }: { d: any }) {
    return (
      <article className="card device">
        <h2>{d.name}</h2>
        <DeviceVisual device={d} />
        <span className={"badge " + (d.revoked ? "danger" : "")}>
          {d.revoked
            ? "Objet révoqué"
            : d.online
              ? ((
                  {
                    LOCK: "Verrouillée",
                    UNLOCK: "Déverrouillée",
                    ON: "Allumée",
                    OFF: "Éteinte",
                    ACTIVATE: "Active",
                    DEACTIVATE: "Inactive",
                  } as Record<string, string>
                )[d.state] ?? d.state)
              : "État inconnu / hors ligne"}
        </span>
        <p>
          {d.label} / {d.room || "Maison de démonstration"}
        </p>
        <small>
          Identité enregistrée ·{" "}
          {d.version ? `v${d.version}` : "version non confirmée"}
        </small>
        <Link className="button" to={"/devices/" + d.id}>
          Voir{" "}
          {d.modelId === id("G25-LOCK")
            ? "la serrure"
            : d.modelId === id("G25-PLUG")
              ? "la prise"
              : "la caméra"}
        </Link>
      </article>
    );
  }
  function CommandTable({ items }: { items: any[] }) {
    return items.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Événement</th>
              <th>Objet</th>
              <th>Résultat</th>
            </tr>
          </thead>
          <tbody>
            {items.map((j) => (
              <tr key={j.requestId}>
                <td>
                  <Link to={"/commands/" + j.requestId}>
                    {labels[j.action]}
                  </Link>
                </td>
                <td>
                  {devices.find((d) => d.id === j.deviceId)?.label ??
                    DEVICES.find((d) => deviceId(d.label) === j.deviceId)
                      ?.label ??
                    short(j.deviceId)}
                </td>
                <td>
                  <span className="badge">{j.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p>
        Aucune commande. Une exécution ne sera confirmée qu’après réception d’un
        accusé authentifié.
      </p>
    );
  }
  function Firmware({ d }: { d?: any }) {
    const list = d
      ? [DEVICES.find((v) => id(v.model) === d.modelId)].filter(Boolean)
      : DEVICES;
    return (
      <>
        <p>
          Les versions installées sont confirmées par le simulateur.{" "}
          {config?.mode === "local"
            ? "Stockage IPFS local de développement ; épinglage public non vérifié."
            : "Disponibilité IPFS à vérifier sur les services hébergés."}
        </p>
        {list.map((spec) => (
          <section className="card" key={spec!.model}>
            <h2>{spec!.model}</h2>
            <button
              className="secondary"
              onClick={() => void loadCatalog(id(spec!.model))}
            >
              Charger les publications sur chaîne
            </button>
            {catalog[id(spec!.model)]?.length === 0 && (
              <p>Aucune publication.</p>
            )}
            {catalog[id(spec!.model)]?.map((v) => (
              <article className="release" key={v.version}>
                <h3>Version {v.version}</h3>
                <p>
                  {v.authorized
                    ? "Fabricant actuellement autorisé"
                    : "Fabricant révoqué : installation bloquée"}
                </p>
                <Hash value={v.sha256Digest} />
                <Hash value={v.cid} />
                <p>{v.fileSize} octets</p>
                {d?.isOwner && (
                  <button
                    disabled={!!busy || d.revoked || !v.authorized}
                    onClick={() => {
                      if (
                        !confirm(
                          `Installer la version ${v.version} sur ${d.name} ?`,
                        )
                      )
                        return;
                      void run("Autorisation d’installation", async () => {
                        const s = await signer();
                        const authorization = {
                          deviceId: d.id,
                          version: v.version,
                          nonce: hexlify(randomBytes(32)),
                          expiresAt: Math.floor(Date.now() / 1000) + 300,
                        };
                        const signature = await s.signTypedData(
                          homeDomain(config.chainId, config.registry),
                          installTypes,
                          authorization,
                        );
                        await api("/firmware/install", {
                          method: "POST",
                          body: JSON.stringify({ ...authorization, signature }),
                        });
                      });
                    }}
                  >
                    Autoriser l’installation simulée
                  </button>
                )}
              </article>
            ))}
          </section>
        ))}
        {installations.map((i) => (
          <p key={i.nonce}>
            Version {i.version} : {i.status} <code>{short(i.deviceId)}</code>
          </p>
        ))}
      </>
    );
  }
  const restricted =
    !token &&
    !["/demo", "/infrastructure", "/connect"].includes(location.pathname);
  let content: React.ReactNode;
  if (restricted || location.pathname === "/connect")
    content = (
      <section className="card form">
        <h2>Connectez votre portefeuille de test</h2>
        <p>
          Vos capacités sont déterminées par les contrats. Une signature de
          session est requise pour consulter vos objets.
        </p>
        <button onClick={() => void connect()} disabled={!!busy}>
          Connecter le portefeuille
        </button>
        <Link to="/demo">Lire le guide sans portefeuille</Link>
      </section>
    );
  else if (
    token &&
    !loaded &&
    !["/demo", "/infrastructure"].includes(location.pathname)
  )
    content = <p>Chargement de vos droits…</p>;
  else if (location.pathname === "/setup")
    content = (
      <>
        <section className="card form">
          <h2>Votre compte et ses droits</h2>
          <Hash value={account} />
          <p>
            Vous possédez {ownerDevices.length} objet(s). Un compte peut
            posséder ses objets et recevoir un accès invité à ceux d’un autre
            propriétaire.
          </p>
          <p>
            Le propriétaire accorde et révoque les accès dans Permissions.
            Chaque utilisateur connecte son propre compte et signe sa session.
            Une adresse publique suffit pour accorder un accès.
          </p>
          {isOwner && (
            <Link className="button" to="/permissions/new">
              Accorder une permission à un compte
            </Link>
          )}
          <h3>Administrateur des fabricants</h3>
          {onboarding && <Hash value={onboarding.administrator} />}
          <p>
            Ce rôle autorise les fabricants de micrologiciels. Il ne donne pas
            automatiquement accès aux objets.
          </p>
          {onboarding?.administrator?.toLowerCase() ===
            account.toLowerCase() && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run("Gestion du fabricant", async () => {
                  const address = String(f.get("manufacturer"));
                  if (!isAddress(address) || address === ZeroAddress)
                    throw Error("Adresse fabricant invalide");
                  await tx(
                    String(f.get("operation")),
                    [id(String(f.get("model"))), address],
                    true,
                  );
                });
              }}
            >
              <h3>Gérer un fabricant</h3>
              <label>
                Modèle du fabricant
                <select name="model" aria-label="Modèle du fabricant">
                  {DEVICES.map((d) => (
                    <option key={d.model}>{d.model}</option>
                  ))}
                </select>
              </label>
              <label>
                Adresse publique du fabricant
                <input name="manufacturer" required />
              </label>
              <label>
                Opération
                <select name="operation" aria-label="Opération">
                  <option value="authorizeManufacturer">Autoriser</option>
                  <option value="revokeManufacturer">Révoquer</option>
                </select>
              </label>
              <button disabled={!!busy}>
                Confirmer la modification du fabricant
              </button>
            </form>
          )}
        </section>
        <section className="card form">
          <h2>Demandes d’accès</h2>
          <p>
            Une demande ne donne aucun droit. Le propriétaire doit signer une
            permission sur la chaîne.
          </p>
          {!requests.length && <p>Aucune demande.</p>}
          {requests.map((request) => (
            <article key={request.id}>
              <h3>
                {request.label} — {request.status}
              </h3>
              <Hash value={request.requester} />
              <p>
                Expiration :{" "}
                {new Date(request.expiresAt * 1000).toLocaleString("fr")}
              </p>
              {request.owner.toLowerCase() === account.toLowerCase() &&
                request.status === "en attente" && (
                  <div className="actions">
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void run("Approbation de l’accès", () =>
                          tx("grantPermission", [
                            request.deviceId,
                            request.requester,
                            request.mask,
                            request.expiresAt,
                          ]),
                        )
                      }
                    >
                      Approuver la demande
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void run("Refus de la demande", () =>
                          api(`/access-requests/${request.id}/dismiss`, {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      Refuser la demande
                    </button>
                  </div>
                )}
            </article>
          ))}
        </section>
        {onboarding?.objects.map((d: any) => (
          <section className="card form" key={d.id}>
            <h2>
              {d.label} — {d.model}
            </h2>
            <p>
              {d.revoked
                ? "Objet définitivement révoqué"
                : d.registered
                  ? d.isOwner
                    ? "Vous êtes propriétaire"
                    : "Déjà enregistré par un autre compte"
                  : "Disponible pour un premier enregistrement"}
            </p>
            {d.registered && !d.isOwner && !d.revoked && (
              <button
                disabled={
                  !!busy ||
                  requests.some(
                    (r) =>
                      r.deviceId === d.id &&
                      r.requester.toLowerCase() === account.toLowerCase() &&
                      r.status === "en attente",
                  )
                }
                onClick={() =>
                  void run("Demande d’accès", () =>
                    api("/access-requests", {
                      method: "POST",
                      body: JSON.stringify({ deviceId: d.id, hours: 1 }),
                    }),
                  )
                }
              >
                Demander les actions de {d.label} pour une heure
              </button>
            )}
            {d.owner && (
              <>
                <p>Propriétaire à contacter pour obtenir une permission :</p>
                <Hash value={d.owner} />
              </>
            )}
            {d.signer && (
              <>
                <p>Adresse publique de l’objet :</p>
                <Hash value={d.signer} />
              </>
            )}
            {!d.registered && (
              <Link to="/devices/new">
                Enregistrer cet objet avec mon compte
              </Link>
            )}
            {d.registered && !d.isOwner && (
              <p>
                Transmettez votre adresse ci-dessus au propriétaire et précisez
                les actions souhaitées et la durée. Changer l’adresse de l’objet
                ne change pas son propriétaire.
              </p>
            )}
          </section>
        ))}
        {config?.mode === "local" && (
          <section className="card form">
            <h2>Démonstration locale préconfigurée</h2>
            <p>
              Si le propriétaire est le compte de préparation, l’opérateur du
              projet peut accorder un accès depuis le terminal avec la commande
              suivante. Elle n’est disponible que sur Hardhat local.
            </p>
            <code>npm run local:access -- {account} LOCK-01 1</code>
            <p>
              Cette commande accorde une heure d’accès à la serrure et fournit
              uniquement des ETH fictifs pour les transactions locales. Pour une
              installation neuve, suivre le démarrage manuel du README ; aucun
              objet existant n’est réinitialisé depuis cette page.
            </p>
          </section>
        )}
      </>
    );
  else if (["/", "/guest", "/manufacturer"].includes(location.pathname))
    content = (
      <>
        <div className="grid stats">
          {[
            [
              "Objets actifs",
              devices.filter((d) => !d.revoked).length + " / " + devices.length,
            ],
            [
              "Accès invités",
              permissions.filter(
                (p) => p.mask && p.expiresAt > Date.now() / 1000,
              ).length,
            ],
            [
              "Commandes du jour",
              commands.filter(
                (j) =>
                  new Date((j.ack?.executedAt ?? 0) * 1000).toLocaleDateString(
                    "fr",
                    { timeZone: "Africa/Kinshasa" },
                  ) ===
                  new Date().toLocaleDateString("fr", {
                    timeZone: "Africa/Kinshasa",
                  }),
              ).length,
            ],
          ].map(([label, value]) => (
            <article className="card" key={label}>
              <h2>{label}</h2>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <div className="grid">
          {devices.map((d) => (
            <DeviceCard d={d} key={d.id} />
          ))}
        </div>
        {!devices.length && (
          <section className="card">
            <h2>Aucun objet accessible</h2>
            <p>
              Le propriétaire peut enregistrer un objet ou vous accorder une
              permission.
            </p>
            <Link to="/setup">Configurer mon compte ou obtenir un accès</Link>
          </section>
        )}
        {isManufacturer && (
          <Link className="button" to="/manufacturer/firmware/new">
            Publier un micrologiciel
          </Link>
        )}
        <section className="card">
          <h2>Dernières activités</h2>
          <CommandTable items={commands.slice(0, 5)} />
        </section>
      </>
    );
  else if (location.pathname === "/devices")
    content = (
      <>
        <Link className="button" to="/devices/new">
          Enregistrer un objet
        </Link>
        <div className="grid">
          {devices.map((d) => (
            <DeviceCard key={d.id} d={d} />
          ))}
        </div>
        {!devices.length && <p>Aucun objet accessible.</p>}
      </>
    );
  else if (location.pathname === "/devices/new")
    content = (
      <Registration
        run={run}
        tx={tx}
        navigate={navigate}
        busy={busy}
        provisioning={onboarding?.objects}
        api={api}
        automaticProvisioning={!!onboarding?.automaticProvisioning}
      />
    );
  else if (location.pathname.startsWith("/devices/"))
    content = selected ? (
      isFirmwareDetail ? (
        <Firmware d={selected} />
      ) : (
        <section className="card">
          <h2>{selected.name}</h2>
          <DeviceVisual device={selected} />
          {selected.modelId === id("G25-CAM") && (
            <CameraPreview key={selected.id} device={selected} />
          )}
          <p>
            {selected.revoked
              ? "DEVICE_REVOKED : objet définitivement révoqué"
              : selected.online
                ? selected.state
                : "DEVICE_OFFLINE : résultat physique inconnu"}
          </p>
          <Hash value={selected.id} />
          <p>Propriétaire</p>
          <Hash value={selected.owner} />
          <p>Identité de signature de l’objet</p>
          <Hash value={selected.signer} />
          <div className="actions">
            {selected.actions.map((a: number) => (
              <button
                key={a}
                disabled={!!busy || selected.revoked || !selected.allowed[a]}
                onClick={() => void command(selected, a)}
              >
                {labels[a]}
              </button>
            ))}
          </div>
          {selected.isOwner && (
            <>
              <Link to={"/devices/" + selected.id + "/firmware"}>
                Vérifier et installer un micrologiciel
              </Link>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run("Métadonnées", () =>
                    api("/devices/" + selected.id + "/metadata", {
                      method: "PATCH",
                      body: JSON.stringify({
                        name: f.get("name"),
                        room: f.get("room"),
                      }),
                    }),
                  );
                }}
              >
                <label>
                  Nom d’affichage
                  <input
                    name="name"
                    defaultValue={selected.name}
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  Pièce fictive
                  <input
                    name="room"
                    defaultValue={selected.room}
                    maxLength={80}
                  />
                </label>
                <button disabled={!!busy}>Enregistrer les métadonnées</button>
              </form>
            </>
          )}
        </section>
      )
    ) : (
      <p>Objet absent ou accès refusé.</p>
    );
  else if (location.pathname === "/permissions/new")
    content = isOwner ? (
      <PermissionForm
        ownerDevices={ownerDevices}
        devices={devices}
        run={run}
        tx={tx}
        navigate={navigate}
        busy={busy}
      />
    ) : (
      <p>PERMISSION_DENIED : seul le propriétaire peut accorder des droits.</p>
    );
  else if (location.pathname === "/permissions")
    content = (
      <>
        <Link className="button" to="/permissions/new">
          Accorder une permission
        </Link>
        {!permissions.length && <p>Aucune permission.</p>}
        {permissions.map((p) => (
          <article className="card" key={p.deviceId + p.user}>
            <Hash value={p.user} />
            <p>
              Objet :{" "}
              {devices.find((d) => d.id === p.deviceId)?.label ??
                DEVICES.find((d) => deviceId(d.label) === p.deviceId)?.label ??
                short(p.deviceId)}
            </p>
            <p>
              {p.mask
                ? ACTIONS.filter((_, a) => p.mask & (1 << a)).join(", ")
                : "Révoquée"}{" "}
              ·{" "}
              {p.expiresAt
                ? new Date(p.expiresAt * 1000).toLocaleString("fr", {
                    timeZone: "Africa/Kinshasa",
                  }) + " Africa/Kinshasa"
                : ""}{" "}
              {p.mask && p.expiresAt <= Date.now() / 1000
                ? "PERMISSION_EXPIRED"
                : ""}
            </p>
            {ownerDevices.some((d) => d.id === p.deviceId) && p.mask > 0 && (
              <button
                className="danger"
                disabled={!!busy}
                onClick={() => {
                  if (confirm("Révoquer l’accès de " + p.user + " ?"))
                    void run("Révocation", () =>
                      tx("revokePermission", [p.deviceId, p.user]),
                    );
                }}
              >
                Révoquer l’accès
              </button>
            )}
          </article>
        ))}
      </>
    );
  else if (location.pathname === "/commands")
    content = (
      <section className="card">
        <CommandTable items={commands.slice(page * 20, page * 20 + 20)} />
        <div className="actions">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Précédent
          </button>
          <button
            disabled={(page + 1) * 20 >= commands.length}
            onClick={() => setPage(page + 1)}
          >
            Suivant
          </button>
        </div>
        <small>100 dernières demandes visibles au maximum.</small>
      </section>
    );
  else if (location.pathname.startsWith("/commands/")) {
    const j = commands.find((j) => j.requestId === currentId);
    content = j ? (
      <section className="card">
        <h2>
          {labels[j.action]} — {j.status}
        </h2>
        <p>
          Demande confirmée → transmission MQTT → accusé authentifié → preuve
          sur chaîne.
        </p>
        <Hash value={j.requestId} />
        <Hash value={j.txHash} />
        {config.chainId === 11155111 && (
          <a
            href={"https://sepolia.etherscan.io/tx/" + j.txHash}
            target="_blank"
            rel="noreferrer"
          >
            Voir la demande sur l’explorateur
          </a>
        )}
        <p>
          Expiration :{" "}
          {new Date(j.deadline * 1000).toLocaleString("fr", {
            timeZone: "Africa/Kinshasa",
          })}{" "}
          Africa/Kinshasa
        </p>
        <p>{j.attempts} tentative(s) de transmission</p>
        {j.ack ? (
          <>
            <h3>Accusé authentifié de l’objet</h3>
            <Hash value={j.ack.signature} />
            <Hash value={j.ack.stateHash} />
            {j.resultTxHash && (
              <>
                <p>Transaction d’ancrage du résultat</p>
                <Hash value={j.resultTxHash} />
                {config.chainId === 11155111 && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={"https://sepolia.etherscan.io/tx/" + j.resultTxHash}
                  >
                    Consulter la preuve sur chaîne
                  </a>
                )}
              </>
            )}
            <p>État déclaré : {j.ack.state}</p>
          </>
        ) : (
          <p>
            {j.onchainResult
              ? "Résultat authentifié ancré sur chaîne. Détail de l’accusé hors chaîne non récupéré."
              : "Résultat non confirmé. Un délai dépassé ne prouve pas l’absence d’une action passée."}
          </p>
        )}
      </section>
    ) : (
      <p>Commande absente ou accès refusé.</p>
    );
  } else if (location.pathname === "/manufacturer/firmware/new")
    content = isManufacturer ? (
      <Publish
        models={models}
        run={run}
        api={api}
        signer={signer}
        tx={tx}
        config={config}
        setCatalog={setCatalog}
        navigate={navigate}
        busy={busy}
        setBusy={setBusy}
      />
    ) : (
      <p>PERMISSION_DENIED : fabricant non autorisé.</p>
    );
  else if (location.pathname === "/firmware") content = <Firmware />;
  else if (location.pathname === "/security")
    content = (
      <>
        <section className="card">
          <h2>Révocation permanente</h2>
          <p>
            La révocation bloque les nouvelles demandes et les travaux encore
            invalidables. Les messages en vol et les actions passées ne peuvent
            pas être annulés.
          </p>
          {ownerDevices.map((d) => (
            <div className="release" key={d.id}>
              <h3>{d.name}</h3>
              <button
                className="danger"
                disabled={!!busy || d.revoked}
                onClick={() => {
                  if (
                    confirm(
                      `Révoquer définitivement ${d.label} ? Remplacement par un nouvel identifiant et une nouvelle clé obligatoire.`,
                    )
                  )
                    void run("Révocation de l’objet", () =>
                      tx("revokeDevice", [d.id]),
                    );
                }}
              >
                {d.revoked ? "Déjà révoqué" : "Révoquer cet objet"}
              </button>
            </div>
          ))}
        </section>
      </>
    );
  else if (location.pathname === "/audit") {
    const filtered = audit.filter(
      (a) => !eventFilter || a.event === eventFilter,
    );
    content = (
      <section className="card">
        <h2>Événements sur chaîne</h2>
        <label>
          Filtrer
          <select
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Tous les événements visibles</option>
            {[...new Set(audit.map((a) => a.event))].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(filtered, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "journal-g25.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Exporter les événements visibles (100 maximum)
        </button>
        {filtered.slice(page * 20, page * 20 + 20).map((a) => (
          <p key={a.id}>
            {a.event} · Bloc {a.block} · <code>{short(a.txHash)}</code>
          </p>
        ))}
        <div className="actions">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Précédent
          </button>
          <button
            disabled={(page + 1) * 20 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Suivant
          </button>
        </div>
        <p>
          Les accusés signés sont consultables dans les commandes. Les
          tentatives API refusées sont conservées séparément côté passerelle.
        </p>
      </section>
    );
  } else if (location.pathname === "/infrastructure")
    content = (
      <section className="card">
        <h2>État des dépendances</h2>
        {infra ? (
          Object.entries(infra).map(([k, v]) => (
            <p key={k}>
              <b>{k}</b> :{" "}
              {typeof v === "boolean" ? (v ? "Oui" : "Non") : String(v)}
            </p>
          ))
        ) : (
          <p>Informations indisponibles.</p>
        )}
        <p>
          Déploiement public et vérification explorateur : non attestés par
          cette interface.
        </p>
      </section>
    );
  else if (location.pathname === "/demo")
    content = (
      <section className="card prose">
        <h2>Maison intelligente — Groupe 25, UNIKIN</h2>
        <p>
          Identité des objets et contrôle d’accès décentralisé. Trois objets
          simulés : serrure, prise et caméra sans vidéo. Aucun fonds réel, aucun
          jeton émis.
        </p>
        <ol>
          <li>Connecter un portefeuille de test propriétaire.</li>
          <li>
            Consulter les identités, puis constater le refus d’un invité sans
            droit.
          </li>
          <li>Accorder une action temporaire à son adresse.</li>
          <li>Envoyer une commande ; consulter l’accusé signé.</li>
          <li>
            Révoquer l’accès et constater le refus des nouvelles demandes.
          </li>
          <li>Publier un fichier inerte signé par un fabricant autorisé.</li>
          <li>
            Autoriser son installation ; vérifier les refus de fichiers altérés.
          </li>
          <li>Révoquer l’objet compromis et consulter le journal.</li>
        </ol>
        <p>
          Le broker et la passerelle restent des dépendances de confiance et de
          disponibilité. L’accusé prouve la déclaration du simulateur, sans
          observation physique indépendante.
        </p>
        <p>
          Mode local : consultez le README pour démarrer les services. Les
          comptes techniques et les clés d’objets ne sont jamais demandés dans
          l’interface.
        </p>
      </section>
    );
  else
    content = (
      <section className="card">
        <h2>Page introuvable</h2>
        <Link to="/">Retour au tableau de bord</Link>
      </section>
    );
  const nav = [
    ["/", "Vue d’ensemble"],
    ["/devices", "Objets connectés"],
    ["/setup", "Comptes et configuration"],
    ...(isOwner ? [["/permissions", "Permissions"]] : []),
    ["/commands", "Commandes"],
    ["/firmware", "Micrologiciels"],
    ...(isOwner ? [["/security", "Sécurité"]] : []),
    ["/audit", "Journal d’activité"],
    ["/infrastructure", "Infrastructure"],
    ...(isManufacturer ? [["/manufacturer", "Espace fabricant"]] : []),
    ["/demo", "Guide et démonstration"],
  ];
  return (
    <div className="shell">
      <button
        className="mobile-menu"
        aria-expanded={menu}
        aria-controls="navigation"
        onClick={() => setMenu(!menu)}
      >
        ☰ Menu
      </button>
      <aside id="navigation" className={menu ? "open" : ""}>
        <Link to="/" className="brand">
          ⌂ SMART HOME
        </Link>
        <small>GROUPE 25 / UNIKIN</small>
        <small>MAISON DE DÉMONSTRATION</small>
        <nav aria-label="Navigation principale">
          {nav.map(([path, label]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="network">
          <b>
            {config?.chainId === 11155111
              ? "SEPOLIA"
              : config?.chainId === 31337
                ? "HARDHAT LOCAL"
                : "RÉSEAU INDISPONIBLE"}
          </b>
          <small>
            Objets simulés
            <br />
            Aucun fonds réel
          </small>
        </div>
      </aside>
      <main>
        <header>
          <span className="badge">
            ●{" "}
            {config?.chainId === 11155111
              ? "Sepolia"
              : config?.chainId === 31337
                ? "Local"
                : "Indisponible"}
          </span>
          <span>
            Maison 01 /{" "}
            {isOwner
              ? "Propriétaire"
              : isManufacturer
                ? "Fabricant"
                : account
                  ? "Invité"
                  : "Visiteur"}
          </span>
          {account ? (
            <button
              className="secondary"
              title={account}
              onClick={() =>
                void run("Déconnexion", async () => {
                  await api("/auth/logout", { method: "POST" });
                  reset();
                })
              }
            >
              {short(account)} · Déconnexion
            </button>
          ) : (
            <button onClick={() => void connect()} disabled={!!busy}>
              Connecter
            </button>
          )}
        </header>
        <h1>
          {location.pathname === "/"
            ? "Bonjour" +
              (isOwner
                ? ", propriétaire"
                : account
                  ? ", " + (isManufacturer ? "fabricant" : "invité")
                  : "")
            : (titles[location.pathname] ??
              (isFirmwareDetail
                ? "Vérifier et installer"
                : location.pathname.startsWith("/commands/")
                  ? "Détail de la commande"
                  : "Détail de l’objet"))}
        </h1>
        <p className="intro">
          Votre maison de démonstration. Chaque action autorisée est traçable.
        </p>
        {infra?.mqtt === false && (
          <div className="alert" role="status">
            <strong>Connexion MQTT interrompue.</strong>
            <p>
              Une transaction blockchain confirmée ne confirme pas l’exécution
              de l’objet. Les états restent inconnus jusqu’au retour signé du
              simulateur.
            </p>
            <Link to="/infrastructure">Vérifier la connexion des services</Link>
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            <button className="secondary" onClick={() => void refresh()}>
              Réessayer
            </button>
          </div>
        )}
        {busy && (
          <div className="notice" role="status" aria-live="polite">
            {busy}…
          </div>
        )}
        {content}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
