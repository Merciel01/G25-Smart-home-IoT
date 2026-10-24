import { Wallet } from "ethers";
import { Store } from "../../../packages/shared/src/storage.ts";
import {
  commandSchema,
  commandTypes,
  ackTypes,
  homeDomain,
  signedBy,
  stateHash,
  ACTIONS,
  installSchema,
  manifestTypes,
  firmwareDomain,
  cidHash,
  installTypes,
  installResultTypes,
  same,
  cidSchema,
} from "../../../packages/shared/src/protocol.ts";
import { sha256 } from "ethers";
export class Engine {
  constructor(
    public store: Store,
    public chainId: number,
    public registry: string,
    public gateway: string,
    public signers: Map<string, Wallet>,
    public executable: (id: string) => Promise<boolean>,
    public home: any,
    public fw: any,
    public firmwareRegistry: string,
    public ipfsBase: string,
  ) {}
  async command(topicId: string, input: unknown) {
    const e = commandSchema.parse(input);
    const signer = this.signers.get(topicId);
    if (
      !signer ||
      e.deviceId !== topicId ||
      e.chainId !== this.chainId ||
      !same(e.registry, this.registry) ||
      e.issuedAt > e.expiresAt ||
      e.issuedAt > Math.floor(Date.now() / 1000) + 5 ||
      !signedBy(
        homeDomain(this.chainId, this.registry),
        commandTypes,
        e,
        e.signature,
        this.gateway,
      )
    )
      throw Error("INVALID_SIGNATURE");
    return this.store.mutate(async (s) => {
      s.acks ??= {};
      s.devices ??= {};
      if (s.acks[e.requestId]) return s.acks[e.requestId];
      if (e.expiresAt <= Math.floor(Date.now() / 1000))
        throw Error("COMMAND_EXPIRED");
      if (!(await this.executable(e.requestId)))
        throw Error("PERMISSION_DENIED");
      const command = await this.home.commands(e.requestId);
      if (
        command.deviceId !== e.deviceId ||
        Number(command.action) !== e.action ||
        !same(command.requester, e.requester) ||
        Number(command.revision) !== e.permissionRevision ||
        Number(command.deadline) !== e.expiresAt ||
        !(await this.home.isCommandExecutable(e.requestId))
      )
        throw Error("PERMISSION_DENIED");
      const d = await this.home.getDevice(topicId);
      if (
        !same(d.deviceSigner, signer.address) ||
        d.revoked ||
        !(Number(await this.home.allowedMask(d.modelId)) & (1 << e.action))
      )
        throw Error("WRONG_MODEL");
      // Hardhat can mine a registration ahead of wall time. Retry before any effect,
      // rather than permanently caching an acknowledgement predating registration.
      if (Number(d.registeredAt) > Math.floor(Date.now() / 1000))
        throw Error("CHAIN_CLOCK_AHEAD");
      const device = s.devices[topicId] ?? { version: 0, nonce: 0 };
      device.nonce++;
      device.state = ACTIONS[e.action];
      device.executions = (device.executions ?? 0) + 1;
      const a = {
        requestId: e.requestId,
        deviceId: topicId,
        action: e.action,
        outcome: 1,
        stateHash: stateHash(device.state),
        executedAt: Math.floor(Date.now() / 1000),
        deviceNonce: device.nonce,
      };
      const signature = await signer.signTypedData(
        homeDomain(this.chainId, this.registry),
        ackTypes,
        a,
      );
      const ack = { ...a, signature, state: device.state };
      s.devices[topicId] = device;
      s.acks[e.requestId] = ack;
      return ack;
    });
  }
  async install(topicId: string, input: unknown) {
    const i = installSchema.parse(input);
    const signer = this.signers.get(topicId);
    if (!signer || i.deviceId !== topicId) throw Error("WRONG_MODEL");
    return this.store.mutate(async (s) => {
      s.installs ??= {};
      s.devices ??= {};
      const replay = s.installs[i.nonce];
      if (replay) {
        if (replay.signature !== i.signature) throw Error("REPLAY");
        return replay.result;
      }
      if (
        i.expiresAt <= Math.floor(Date.now() / 1000) ||
        i.expiresAt > Math.floor(Date.now() / 1000) + 600
      )
        throw Error("COMMAND_EXPIRED");
      const d = await this.home.getDevice(topicId);
      if (d.revoked || !same(d.deviceSigner, signer.address))
        throw Error("DEVICE_REVOKED");
      if (
        !signedBy(
          homeDomain(this.chainId, this.registry),
          installTypes,
          i,
          i.signature,
          d.owner,
        )
      )
        throw Error("PERMISSION_DENIED");
      const release = await this.fw.getFirmware(d.modelId, i.version);
      const m = release.manifest;
      const manifest = {
        modelId: m.modelId,
        version: m.version,
        sha256Digest: m.sha256Digest,
        cidHash: m.cidHash,
        fileSize: m.fileSize,
        manufacturer: m.manufacturer,
      };
      if (m.modelId !== d.modelId) throw Error("WRONG_MODEL");
      if (
        !(await this.fw.isManufacturerAuthorized(m.modelId, m.manufacturer)) ||
        !signedBy(
          firmwareDomain(this.chainId, this.firmwareRegistry),
          manifestTypes,
          manifest,
          release.signature,
          m.manufacturer,
        )
      )
        throw Error("INVALID_SIGNATURE");
      if (cidHash(release.cid) !== m.cidHash) throw Error("INVALID_CID");
      const device = s.devices[topicId] ?? { nonce: 0, version: 0 };
      if (i.version <= device.version) throw Error("ROLLBACK_BLOCKED");
      if (Number(m.fileSize) > 1048576) throw Error("FILE_TOO_LARGE");
      const r = await fetch(
        this.ipfsBase.replace(/\/$/, "") + "/" + cidSchema.parse(release.cid),
        { signal: AbortSignal.timeout(10000), redirect: "error" },
      );
      if (!r.ok || !r.body) throw Error("IPFS_UNAVAILABLE");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of r.body as any) {
        size += chunk.length;
        if (size > 1048576) {
          await r.body.cancel().catch(() => {});
          throw Error("FILE_TOO_LARGE");
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (size !== Number(m.fileSize) || sha256(bytes) !== m.sha256Digest)
        throw Error("HASH_MISMATCH");
      // Recheck revocations after download, immediately before applying the inert version.
      const latestDevice = await this.home.getDevice(topicId);
      if (
        latestDevice.revoked ||
        !(await this.fw.isManufacturerAuthorized(m.modelId, m.manufacturer))
      )
        throw Error("PERMISSION_DENIED");
      device.version = i.version;
      s.devices[topicId] = device;
      const result = {
        deviceId: topicId,
        version: i.version,
        nonce: i.nonce,
        stateHash: stateHash("firmware:" + i.version),
        installedAt: Math.floor(Date.now() / 1000),
      };
      const signature = await signer.signTypedData(
        homeDomain(this.chainId, this.registry),
        installResultTypes,
        result,
      );
      s.installs[i.nonce] = {
        signature: i.signature,
        result: { ...result, signature },
      };
      return s.installs[i.nonce].result;
    });
  }
}
