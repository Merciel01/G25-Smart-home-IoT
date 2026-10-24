import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Wallet, sha256, getAddress, ZeroAddress } from "ethers";
import { z } from "zod";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { MqttClient } from "mqtt";
import { config } from "../../../packages/shared/src/config.ts";
import { Store } from "../../../packages/shared/src/storage.ts";
import { authService } from "./auth.ts";
import { Indexer } from "./indexer.ts";
import {
  same,
  DEVICES,
  deviceId,
  json,
  installSchema,
  signedBy,
  homeDomain,
  installTypes,
  installResultTypes,
  cidHash,
  hex32,
  address,
  stateHash,
  statusTypes,
  installFailureTypes,
} from "../../../packages/shared/src/protocol.ts";
import {
  provisionStore,
  specifications,
  openProvision,
  sealProvision,
} from "../../../packages/shared/src/provisioning.ts";
import { externalBroker } from "../../../packages/shared/src/external-broker.ts";
const provisioningStore = provisionStore();
const provisioningTasks = new Map<string, Promise<void>>();
const bodyAddress = z.object({ address });
const uploadSchema = z
  .object({ modelId: hex32, bytes: z.string().max(1398104) })
  .strict();
export function createApp(
  c: ReturnType<typeof config>,
  store: Store,
  mqtt: MqttClient,
  indexer: Indexer,
) {
  const app = express();
  if (!c.local) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  const publicIdentities = z
    .record(z.string(), address)
    .parse(JSON.parse(process.env.PUBLIC_DEVICE_IDENTITIES_JSON ?? "{}"));
  const origins = (
    process.env.ALLOWED_ORIGINS ?? "http://localhost:5173"
  ).split(",");
  const auth = authService(store, origins, c.chainId);
  app.use(
    cors({
      origin: (o, cb) => cb(null, !!o && origins.includes(o)),
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "1500kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: c.local ? 1000 : 150,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/health", (_q, r) =>
    r.json({ service: "SmartHome G25", status: "alive" }),
  );
  app.get("/public-config", (_q, r) =>
    r.json({
      chainId: c.chainId,
      registry: c.registry,
      firmwareRegistry: c.firmware,
      abi: c.homeArtifact.abi,
      firmwareAbi: c.fwArtifact.abi,
      mode: c.local ? "local" : "sepolia",
      deploymentBlock: c.block,
    }),
  );
  app.post("/auth/challenge", (q, r, n) => {
    try {
      bodyAddress.parse(q.body);
      void auth.challenge(q, r).catch(n);
    } catch (e) {
      n(e);
    }
  });
  app.post("/auth/verify", (q, r, n) => {
    try {
      z.object({
        message: z.string().max(4096),
        signature: z.string().max(132),
      })
        .strict()
        .parse(q.body);
      void auth.verify(q, r).catch(n);
    } catch (e) {
      n(e);
    }
  });
  app.get("/internal/executable/:id", async (q, r) => {
    hex32.parse(q.params.id);
    if ((await store.read()).halted || (await store.read()).rebuilding) {
      r.status(503).json({ executable: false });
      return;
    }
    r.json({ executable: await c.home.isCommandExecutable(q.params.id) });
  });
  app.get("/infrastructure", async (_q, r) => {
    let rpc = false;
    try {
      rpc = Number((await c.provider.getNetwork()).chainId) === c.chainId;
      await c.provider.getBlockNumber();
    } catch {}
    const s = await store.read();
    r.json({
      rpc,
      mqtt: mqtt.connected,
      indexer: !indexer.lastError && !s.halted,
      storage: c.local ? "Fichier atomique local" : "PostgreSQL",
      simulation: true,
      network: c.chainId === 31337 ? "Hardhat local" : "Sepolia",
      externalDeploymentVerified: false,
    });
  });
  if (c.local)
    app.get("/ipfs/:cid", async (q, r) => {
      if (!/^b[a-z2-7]{9,99}$/.test(q.params.cid)) {
        r.sendStatus(400);
        return;
      }
      try {
        r.type("application/octet-stream").send(
          await fs.readFile(".local/ipfs/" + q.params.cid),
        );
      } catch {
        r.sendStatus(404);
      }
    });
  app.use(auth.middleware);
  app.post("/auth/logout", async (_q, r) => {
    await store.mutate((s) => {
      delete s.sessions?.[r.locals.tokenHash];
    });
    r.sendStatus(204);
  });
  async function visible(addr: string) {
    const s = await store.read();
    const result = [];
    for (const [id, record] of Object.entries(s.devices ?? {}) as any) {
      const d = await c.home.getDevice(id);
      const owner = same(addr, d.owner);
      const allowed = await Promise.all(
        [0, 1, 2, 3, 4, 5].map((a) => c.home.hasPermission(id, addr, a)),
      );
      if (!owner && !allowed.some(Boolean)) continue;
      const metadata = s.metadata?.[id] ?? {};
      const spec = (await specifications(c.registry)).find(
        (v) => deviceId(v.label) === id,
      );
      const state = s.states?.[id];
      result.push({
        id,
        label: spec?.label ?? id,
        name: metadata.name ?? spec?.name ?? "Objet",
        room: metadata.room ?? "",
        owner: d.owner,
        signer: d.deviceSigner,
        modelId: d.modelId,
        revoked: d.revoked,
        registeredAt: Number(d.registeredAt),
        isOwner: owner,
        allowed,
        actions: spec?.actions ?? [],
        state: state?.state ?? "État inconnu",
        version: state?.version ?? null,
        lastSeen: state?.lastSeen ?? null,
        online: !!state?.lastSeen && Date.now() - state.lastSeen < 45000,
      });
    }
    return result;
  }
  const own = async (id: string, addr: string) => {
    hex32.parse(id);
    const d = await c.home.getDevice(id);
    if (!same(d.owner, addr)) throw Error("PERMISSION_DENIED");
    return d;
  };
  // Public chain identities only; never return simulator keys or credentials.
  app.post("/access-requests", async (q, r) => {
    const input = z
      .object({ deviceId: hex32, hours: z.number().int().min(1).max(24) })
      .strict()
      .parse(q.body);
    const spec = (await specifications(c.registry)).find(
      (d) => deviceId(d.label) === input.deviceId,
    );
    if (!spec) throw Error("UNKNOWN_DEVICE");
    const d = await c.home.getDevice(input.deviceId);
    if (d.owner === ZeroAddress || d.revoked || same(d.owner, r.locals.address))
      throw Error("ACCESS_REQUEST_NOT_APPLICABLE");
    const now = Math.floor(Date.now() / 1000);
    const request = {
      id: randomBytes(16).toString("hex"),
      deviceId: input.deviceId,
      label: spec.label,
      requester: r.locals.address,
      owner: d.owner,
      mask: spec.actions.reduce((mask, a) => mask | (1 << a), 0),
      expiresAt: now + input.hours * 3600,
      createdAt: now,
      dismissed: false,
    };
    await store.mutate((s) => {
      const requests = (s.accessRequests ??= {});
      // A single pending request per account/object prevents unbounded duplicate submissions.
      for (const [key, old] of Object.entries(requests) as any)
        if (old.expiresAt <= now) delete requests[key];
      const entries = Object.values(requests) as any[];
      if (
        entries.some(
          (old) =>
            old.deviceId === request.deviceId &&
            same(old.requester, request.requester),
        )
      )
        throw Error("ACCESS_REQUEST_ALREADY_PENDING");
      if (
        entries.filter((old) => same(old.requester, request.requester))
          .length >= 3
      )
        throw Error("ACCESS_REQUEST_LIMIT");
      requests[request.id] = request;
    });
    r.status(201).json(request);
  });
  app.get("/access-requests", async (_q, r) => {
    const requests = Object.values(
      (await store.read()).accessRequests ?? {},
    ) as any[];
    const visible = requests.filter(
      (v) =>
        same(v.owner, r.locals.address) || same(v.requester, r.locals.address),
    );
    const result = [];
    for (const v of visible) {
      const d = await c.home.getDevice(v.deviceId);
      const granted = await Promise.all(
        [0, 1, 2, 3, 4, 5]
          .filter((a) => v.mask & (1 << a))
          .map((a) => c.home.hasPermission(v.deviceId, v.requester, a)),
      );
      result.push({
        ...v,
        status: v.dismissed
          ? "refusée"
          : d.revoked
            ? "objet révoqué"
            : v.expiresAt <= Date.now() / 1000
              ? "expirée"
              : granted.every(Boolean)
                ? "accordée"
                : "en attente",
      });
    }
    r.json(result);
  });
  app.post("/access-requests/:id/dismiss", async (q, r) => {
    const request = (await store.read()).accessRequests?.[q.params.id];
    if (!request) {
      r.sendStatus(404);
      return;
    }
    await own(request.deviceId, r.locals.address);
    await store.mutate((s) => {
      s.accessRequests[q.params.id].dismissed = true;
    });
    r.sendStatus(204);
  });
  const automaticProvisioning =
    c.local ||
    !!(
      process.env.PROVISIONING_ENCRYPTION_KEY &&
      process.env.DATABASE_URL &&
      ((process.env.BROKER_PROVISIONING_DRIVER === "emqx" &&
        process.env.BROKER_API_URL &&
        process.env.BROKER_API_KEY &&
        process.env.BROKER_API_SECRET) ||
        (process.env.BROKER_PROVISIONING_DRIVER === "flespi" &&
          process.env.FLESPI_TOKEN))
    );
  async function finishProvision(id: string) {
    if (c.local && process.env.BROKER_PROVISIONING_DRIVER !== "flespi") return;
    if (provisioningTasks.has(id)) return provisioningTasks.get(id);
    const task = (async () => {
      const stored = (await provisioningStore.read()).devices?.[id];
      if (!stored || !same(stored.registry, c.registry))
        throw Error("PROVISIONING_UNKNOWN_ID");
      const record = openProvision(stored);
      const prepared = await externalBroker().ensureDevice(record);
      await provisioningStore.mutate((s) => {
        s.devices[id] = sealProvision({
          ...record,
          ...(prepared ?? {}),
          status: "ready",
        });
      });
    })();
    provisioningTasks.set(id, task);
    try {
      await task;
    } finally {
      provisioningTasks.delete(id);
    }
  }
  app.post("/provision/:id/retry", async (q, r) => {
    hex32.parse(q.params.id);
    const record = (await provisioningStore.read()).devices?.[q.params.id];
    if (
      !record ||
      !same(record.assignedTo, r.locals.address) ||
      !same(record.registry, c.registry)
    ) {
      r.sendStatus(404);
      return;
    }
    try {
      await finishProvision(record.id);
    } catch {
      r.status(503).json({
        message:
          "Broker indisponible ou configuration refusée. Identité conservée : réessayez sa préparation.",
      });
      return;
    }
    r.json({
      id: record.id,
      label: record.label,
      model: record.model,
      name: record.name,
      signer: record.signer,
    });
  });
  app.post("/provision", async (q, r) => {
    if (!automaticProvisioning) {
      r.status(409).json({
        message: "Le provisionnement du broker externe n’est pas configuré.",
      });
      return;
    }
    const input = z
      .object({
        model: z.enum(["G25-LOCK", "G25-PLUG", "G25-CAM"]),
        name: z.string().trim().min(1).max(64),
      })
      .strict()
      .parse(q.body);
    const wallet = Wallet.createRandom();
    const prefix = input.model.slice(4);
    const label = `${prefix}-${randomBytes(6).toString("hex").toUpperCase()}`;
    const record = {
      registry: c.registry,
      id: deviceId(label),
      label,
      model: input.model,
      name: input.name,
      signer: wallet.address,
      privateKey: wallet.privateKey,
      assignedTo: r.locals.address,
      createdAt: Date.now(),
      status:
        c.local && process.env.BROKER_PROVISIONING_DRIVER !== "flespi"
          ? "ready"
          : "pending",
      credentials: {
        username: "device-" + randomBytes(16).toString("hex"),
        password: randomBytes(32).toString("hex"),
      },
    };
    await provisioningStore.mutate((s) => {
      s.devices ??= {};
      const mine = Object.values(s.devices).filter(
        (d: any) =>
          same(d.assignedTo, r.locals.address) && same(d.registry, c.registry),
      );
      if (process.env.BROKER_PROVISIONING_DRIVER === "flespi") {
        const count = Object.values(s.devices).filter((d: any) =>
          same(d.registry, c.registry),
        ).length;
        const baseCount = Object.keys(
          JSON.parse(process.env.PUBLIC_DEVICE_IDENTITIES_JSON ?? "{}"),
        ).length;
        if (count + baseCount >= 49)
          throw Error(
            "Quota global : 49 appareils maximum pour le broker flespi Free, hors connexions de diagnostic.",
          );
      }
      if (mine.length >= 100)
        throw Error(
          "Limite de 100 appareils provisionnés par compte pour cette démonstration",
        );
      s.devices[record.id] = sealProvision(record);
    });
    try {
      await finishProvision(record.id);
    } catch {
      r.status(503).json({
        message:
          "Préparation MQTT non confirmée. L’identité est conservée ; réessayez sa préparation depuis la liste.",
        id: record.id,
      });
      return;
    }
    r.status(201).json({
      id: record.id,
      label,
      model: record.model,
      signer: record.signer,
      name: record.name,
    });
  });
  app.get("/onboarding", async (_q, r) => {
    const provisioned = c.local
      ? JSON.parse(await fs.readFile(".local/identities.json", "utf8"))
      : {};
    const objects = await Promise.all(
      (await specifications(c.registry))
        .filter(
          (spec: any) =>
            !spec.assignedTo || same(spec.assignedTo, r.locals.address),
        )
        .map(async (spec: any) => {
          const id = deviceId(spec.label);
          const d = await c.home.getDevice(id);
          const registered = d.owner !== ZeroAddress;
          return {
            id,
            label: spec.label,
            model: spec.model,
            owner: registered ? d.owner : null,
            name: spec.name,
            provisioningStatus: spec.status ?? "ready",
            signer: registered
              ? d.deviceSigner
              : spec.signer
                ? spec.signer
                : provisioned[spec.label]
                  ? new Wallet(provisioned[spec.label]).address
                  : publicIdentities[spec.label]
                    ? getAddress(publicIdentities[spec.label])
                    : null,
            registered,
            revoked: d.revoked,
            isOwner: registered && same(d.owner, r.locals.address),
          };
        }),
    );
    r.json({
      address: r.locals.address,
      administrator: await c.fw.owner(),
      objects,
      automaticProvisioning,
    });
  });
  app.get("/devices", async (_q, r) => {
    const devices = await visible(r.locals.address);
    const manufacturerModels = [];
    for (const d of DEVICES)
      if (
        await c.fw.isManufacturerAuthorized(deviceId(d.model), r.locals.address)
      )
        manufacturerModels.push(deviceId(d.model));
    r.json({ devices, manufacturerModels });
  });
  app.patch("/devices/:id/metadata", async (q, r) => {
    await own(q.params.id, r.locals.address);
    const metadata = z
      .object({
        name: z.string().trim().min(1).max(80),
        room: z.string().trim().max(80),
      })
      .strict()
      .parse(q.body);
    await store.mutate((s) => {
      s.metadata ??= {};
      s.metadata[q.params.id] = metadata;
    });
    r.json(metadata);
  });
  app.get("/permissions", async (_q, r) => {
    const s = await store.read();
    const ids = new Set(
      (await visible(r.locals.address))
        .filter((d) => d.isOwner)
        .map((d) => d.id),
    );
    r.json(
      Object.values(s.permissions ?? {}).filter(
        (p: any) => ids.has(p.deviceId) || same(p.user, r.locals.address),
      ),
    );
  });
  async function jobs(addr: string) {
    const s = await store.read();
    const owners = new Set(
      (await visible(addr)).filter((d) => d.isOwner).map((d) => d.id),
    );
    return Object.values(s.jobs ?? {}).filter(
      (j: any) => owners.has(j.deviceId) || same(j.requester, addr),
    );
  }
  const paging = (q: any) => ({
    offset: Math.max(0, Math.min(100000, Number(q.offset) || 0)),
    limit: Math.max(1, Math.min(100, Number(q.limit) || 20)),
  });
  app.get("/commands", async (q, r) => {
    const all = await jobs(r.locals.address);
    const { offset, limit } = paging(q.query);
    r.json({
      total: all.length,
      items: all.reverse().slice(offset, offset + limit),
    });
  });
  app.get("/commands/:id", async (q, r) => {
    const j = (await jobs(r.locals.address)).find(
      (j: any) => j.requestId === q.params.id,
    );
    if (!j) {
      r.sendStatus(404);
      return;
    }
    r.json(j);
  });
  app.get("/audit", async (q, r) => {
    const s = await store.read();
    const ownerIds = new Set(
      (await visible(r.locals.address))
        .filter((d) => d.isOwner)
        .map((d) => d.id),
    );
    let all = Object.values(s.events ?? {}).filter(
      (e: any) =>
        ownerIds.has(e.args.deviceId) ||
        same(e.args.requester ?? ZeroAddress, r.locals.address) ||
        same(e.args.user ?? ZeroAddress, r.locals.address),
    );
    if (q.query.event) all = all.filter((e: any) => e.event === q.query.event);
    const { offset, limit } = paging(q.query);
    r.json({
      total: all.length,
      items: all.reverse().slice(offset, offset + limit),
    });
  });
  app.get("/firmware/:model", async (q, r) => {
    hex32.parse(q.params.model);
    const logs = await c.fw.queryFilter(
      c.fw.filters.FirmwarePublished(q.params.model),
      c.block,
    );
    const versions = [];
    for (const l of logs.slice(-100) as any[]) {
      const release = await c.fw.getFirmware(q.params.model, l.args.version);
      const m = release.manifest;
      versions.push({
        version: Number(m.version),
        modelId: m.modelId,
        sha256Digest: m.sha256Digest,
        cid: release.cid,
        manufacturer: m.manufacturer,
        fileSize: Number(m.fileSize),
        signature: release.signature,
        authorized: await c.fw.isManufacturerAuthorized(
          m.modelId,
          m.manufacturer,
        ),
      });
    }
    r.json(versions);
  });
  app.post("/firmware/upload", async (q, r) => {
    const u = uploadSchema.parse(q.body);
    if (!(await c.fw.isManufacturerAuthorized(u.modelId, r.locals.address)))
      throw Error("PERMISSION_DENIED");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(u.bytes)) throw Error("INVALID_INPUT");
    const bytes = Buffer.from(u.bytes, "base64");
    if (!bytes.length || bytes.length > 1048576) throw Error("FILE_TOO_LARGE");
    let cid: string;
    if (c.local) {
      const raw = Buffer.concat([
        Buffer.from([1, 0x55, 0x12, 0x20]),
        Buffer.from(sha256(bytes).slice(2), "hex"),
      ]);
      const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
      let bits = 0,
        value = 0,
        out = "b";
      for (const b of raw) {
        value = (value << 8) | b;
        bits += 8;
        while (bits >= 5) {
          out += alphabet[(value >>> (bits - 5)) & 31];
          bits -= 5;
        }
      }
      if (bits) out += alphabet[(value << (5 - bits)) & 31];
      cid = out;
      await fs.mkdir(".local/ipfs", { recursive: true });
      await fs.writeFile(".local/ipfs/" + cid, bytes, { mode: 0o600 });
    } else {
      const form = new FormData();
      form.append("file", new Blob([bytes]), "firmware.bin");
      const response = await fetch(
        process.env.IPFS_API_URL + "/api/v0/add?pin=true&cid-version=1",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + process.env.IPFS_API_TOKEN },
          body: form,
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        },
      );
      if (!response.ok) throw Error("IPFS_UNAVAILABLE");
      const body: any = await response.json();
      cid = body.Hash;
    }
    r.json({
      cid,
      cidHash: cidHash(cid),
      sha256Digest: sha256(bytes),
      fileSize: bytes.length,
      modelId: u.modelId,
      manufacturer: getAddress(r.locals.address),
    });
  });
  app.post("/firmware/install", async (q, r) => {
    const i = installSchema.parse(q.body);
    const d = await own(i.deviceId, r.locals.address);
    if (d.revoked) throw Error("DEVICE_REVOKED");
    if (
      !signedBy(
        homeDomain(c.chainId, c.registry),
        installTypes,
        i,
        i.signature,
        d.owner,
      )
    )
      throw Error("INVALID_SIGNATURE");
    if (
      i.expiresAt <= Date.now() / 1000 ||
      i.expiresAt > Date.now() / 1000 + 600
    )
      throw Error("COMMAND_EXPIRED");
    if (!mqtt.connected) throw Error("GATEWAY_UNAVAILABLE");
    await store.mutate((s) => {
      s.installations ??= {};
      if (s.installations[i.nonce]) throw Error("REPLAY");
      s.installations[i.nonce] = {
        ...i,
        owner: d.owner,
        status: "en attente",
        sentAt: 0,
      };
    });
    r.status(202).json({ nonce: i.nonce, status: "en attente" });
  });
  app.get("/installations", async (_q, r) =>
    r.json(
      Object.values((await store.read()).installations ?? {}).filter((i: any) =>
        same(i.owner, r.locals.address),
      ),
    ),
  );
  app.get("/events", async (q, r) => {
    r.setHeader("Content-Type", "text/event-stream");
    r.setHeader("Cache-Control", "no-cache");
    r.flushHeaders();
    const timer = setInterval(async () => {
      const session = (await store.read()).sessions?.[r.locals.tokenHash];
      if (!session || session.expires < Date.now()) {
        r.end();
        return;
      }
      r.write("event: refresh\ndata: {}\n\n");
    }, 3000);
    const expiry = setTimeout(() => r.end(), 900000);
    q.on("close", () => {
      clearInterval(timer);
      clearTimeout(expiry);
    });
  });
  app.use(
    async (
      err: any,
      q: express.Request,
      r: express.Response,
      _n: express.NextFunction,
    ) => {
      const known = [
        "PERMISSION_DENIED",
        "DEVICE_REVOKED",
        "INVALID_SIGNATURE",
        "INVALID_NONCE",
        "INVALID_ORIGIN",
        "COMMAND_EXPIRED",
        "FILE_TOO_LARGE",
        "IPFS_UNAVAILABLE",
        "REPLAY",
        "GATEWAY_UNAVAILABLE",
      ];
      const code =
        err instanceof z.ZodError
          ? "INVALID_INPUT"
          : known.includes(err.message)
            ? err.message
            : "DEPENDENCY_UNAVAILABLE";
      if (r.locals.address)
        await store
          .mutate((s) => {
            s.refusals ??= [];
            s.refusals.push({
              address: r.locals.address,
              code,
              at: new Date().toISOString(),
            });
            s.refusals = s.refusals.slice(-1000);
          })
          .catch(() => {});
      if (!r.headersSent)
        r.status(
          code === "PERMISSION_DENIED"
            ? 403
            : code === "DEPENDENCY_UNAVAILABLE"
              ? 503
              : 400,
        ).json({
          code,
          message:
            code === "DEPENDENCY_UNAVAILABLE"
              ? "Service temporairement indisponible"
              : "Opération refusée : " + code,
        });
    },
  );
  return app;
}
export async function processInstallations(
  c: ReturnType<typeof config>,
  store: Store,
  mqtt: MqttClient,
) {
  const s = await store.read();
  if (s.rebuilding || s.halted) return;
  for (const i of Object.values(s.installations ?? {}) as any[]) {
    if (i.status !== "en attente") continue;
    if (i.expiresAt < Date.now() / 1000) {
      await store.mutate((d) => {
        d.installations[i.nonce].status = "résultat non confirmé";
      });
      continue;
    }
    if (!mqtt.connected || Date.now() - i.sentAt < 5000) continue;
    const d = await c.home.getDevice(i.deviceId);
    if (d.revoked || !same(d.owner, i.owner)) continue;
    await store.mutate((d) => {
      d.installations[i.nonce].sentAt = Date.now();
    });
    const { deviceId, version, nonce, expiresAt, signature } = i;
    await mqtt.publishAsync(
      `${c.prefix}/${deviceId}/commands`,
      JSON.stringify({
        kind: "install",
        authorization: { deviceId, version, nonce, expiresAt, signature },
      }),
      { qos: 1, retain: false },
    );
  }
}
export async function handleStatus(
  c: ReturnType<typeof config>,
  store: Store,
  topic: string,
  buffer: Buffer,
) {
  if (buffer.length > 8192) throw Error("MESSAGE_TOO_LARGE");
  const i = JSON.parse(buffer.toString());
  if (i.kind === "installation-failure") {
    const pending = (await store.read()).installations?.[i.nonce];
    if (
      !pending ||
      pending.deviceId !== i.deviceId ||
      topic !== `${c.prefix}/${i.deviceId}/status` ||
      i.errorHash !== stateHash(i.code) ||
      Math.abs(Date.now() / 1000 - i.reportedAt) > 60
    )
      throw Error("INVALID_SIGNATURE");
    const d = await c.home.getDevice(i.deviceId);
    if (
      !signedBy(
        homeDomain(c.chainId, c.registry),
        installFailureTypes,
        i,
        i.signature,
        d.deviceSigner,
      )
    )
      throw Error("INVALID_SIGNATURE");
    await store.mutate((s) => {
      if (s.installations[i.nonce].status === "installée") return;
      s.installations[i.nonce].status = "refusée : " + i.code;
      s.installations[i.nonce].result = i;
    });
    return;
  }
  if (i.kind === "heartbeat") {
    if (
      topic !== `${c.prefix}/${i.deviceId}/status` ||
      i.stateHash !== stateHash(i.state) ||
      !Number.isSafeInteger(i.observedAt) ||
      !Number.isSafeInteger(i.deviceNonce) ||
      i.deviceNonce < 0 ||
      Math.abs(Date.now() / 1000 - i.observedAt) > 30
    )
      throw Error("INVALID_SIGNATURE");
    const d = await c.home.getDevice(i.deviceId);
    if (
      !signedBy(
        homeDomain(c.chainId, c.registry),
        statusTypes,
        i,
        i.signature,
        d.deviceSigner,
      )
    )
      throw Error("INVALID_SIGNATURE");
    await store.mutate((s) => {
      s.states ??= {};
      if (
        (s.states[i.deviceId]?.observedAt ?? 0) >= i.observedAt ||
        i.deviceNonce < (s.states[i.deviceId]?.deviceNonce ?? 0)
      )
        return;
      s.states[i.deviceId] = {
        ...s.states[i.deviceId],
        state: i.state,
        version: Math.max(s.states[i.deviceId]?.version ?? 0, i.version),
        deviceNonce: i.deviceNonce,
        observedAt: i.observedAt,
        lastSeen: Date.now(),
      };
    });
    return;
  }
  if (i.kind !== "installation") return;
  const s = await store.read();
  const pending = s.installations?.[i.nonce];
  if (
    !pending ||
    pending.deviceId !== i.deviceId ||
    pending.version !== i.version ||
    topic !== `${c.prefix}/${i.deviceId}/status` ||
    i.stateHash !== stateHash("firmware:" + i.version) ||
    i.installedAt > pending.expiresAt ||
    i.installedAt > Date.now() / 1000 + 5
  )
    throw Error("INVALID_SIGNATURE");
  const d = await c.home.getDevice(i.deviceId);
  if (
    !signedBy(
      homeDomain(c.chainId, c.registry),
      installResultTypes,
      i,
      i.signature,
      d.deviceSigner,
    )
  )
    throw Error("INVALID_SIGNATURE");
  await store.mutate((d) => {
    d.installations[i.nonce].status = "installée";
    d.installations[i.nonce].result = i;
    d.states ??= {};
    d.states[i.deviceId] = {
      ...d.states[i.deviceId],
      version: Math.max(d.states[i.deviceId]?.version ?? 0, i.version),
      lastSeen:
        Date.now() / 1000 - i.installedAt < 30
          ? Date.now()
          : (d.states[i.deviceId]?.lastSeen ?? null),
    };
  });
}
