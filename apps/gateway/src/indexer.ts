import { Wallet, ZeroAddress } from "ethers";
import type { MqttClient } from "mqtt";
import { Store } from "../../../packages/shared/src/storage.ts";
import { config } from "../../../packages/shared/src/config.ts";
import {
  homeDomain,
  commandTypes,
  ackSchema,
  ackTypes,
  signedBy,
  same,
  stateHash,
} from "../../../packages/shared/src/protocol.ts";
export class Indexer {
  running = false;
  stopped = false;
  lastError: string | null = null;
  constructor(
    public c: ReturnType<typeof config>,
    public store: Store,
    public mqtt: MqttClient,
    public signer: Wallet,
    public writer: any,
  ) {}
  async tick() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const network = await this.c.provider.getNetwork();
      if (Number(network.chainId) !== this.c.chainId)
        throw Error("WRONG_NETWORK");
      const tip = await this.c.provider.getBlockNumber();
      const safe = tip - this.c.confirmations + 1;
      const s = await this.store.read();
      let cursor = s.cursor ?? { number: this.c.block - 1, hash: null };
      if (cursor.hash) {
        const block = await this.c.provider.getBlock(cursor.number);
        if (block?.hash !== cursor.hash) {
          await this.store.mutate((d) => {
            d.recoveryJobs = d.jobs ?? {};
            d.events = {};
            d.jobs = {};
            d.devices = {};
            d.permissions = {};
            d.rebuilding = true;
            d.cursor = { number: this.c.block - 1, hash: null };
            d.reorganizations ??= [];
            d.reorganizations.push({
              at: new Date().toISOString(),
              replacedBlock: cursor.number,
            });
          });
          this.lastError = "CHAIN_REORG";
          return;
        }
      }
      if (s.halted) throw Error("CHAIN_REORG");
      if (safe > cursor.number) {
        const to = Math.min(safe, cursor.number + 500);
        const logs = await this.c.provider.getLogs({
          address: this.c.registry,
          fromBlock: Math.max(this.c.block, cursor.number - 11),
          toBlock: to,
        });
        const block = await this.c.provider.getBlock(to);
        if (!block) throw Error("RPC_UNAVAILABLE");
        await this.store.mutate((d) => {
          d.events ??= {};
          d.jobs ??= {};
          d.devices ??= {};
          d.permissions ??= {};
          for (const log of logs) {
            const key = `${this.c.chainId}/${log.transactionHash}/${log.index}`;
            if (d.events[key]) continue;
            const p = this.c.home.interface.parseLog(log);
            if (!p) continue;
            const args = Object.fromEntries(
              p.fragment.inputs.map((v: any, i: number) => [
                v.name,
                typeof p.args[i] === "bigint" ? Number(p.args[i]) : p.args[i],
              ]),
            );
            d.events[key] = {
              id: key,
              event: p.name,
              args,
              txHash: log.transactionHash,
              block: log.blockNumber,
            };
            if (p.name === "DeviceRegistered") d.devices[args.deviceId] = args;
            if (
              p.name === "PermissionGranted" ||
              p.name === "PermissionRevoked"
            )
              d.permissions[
                `${args.deviceId}/${String(args.user).toLowerCase()}`
              ] = { ...args };
            if (p.name === "CommandResultRecorded" && d.jobs[args.requestId]) {
              d.jobs[args.requestId].resultTxHash = log.transactionHash;
              d.jobs[args.requestId].resultBlock = log.blockNumber;
              d.jobs[args.requestId].onchainResult = args;
              d.jobs[args.requestId].status =
                args.outcome === 1 ? "exécutée" : "échouée";
            }
            if (p.name === "CommandRequested") {
              const old = d.recoveryJobs?.[args.requestId];
              d.jobs[args.requestId] ??=
                old && old.txHash === log.transactionHash
                  ? old
                  : {
                      ...args,
                      status: old ? "refusée" : "confirmée",
                      txHash: log.transactionHash,
                      attempts: 0,
                      ...(old ? { reason: "CHAIN_REORG_AMBIGUOUS" } : {}),
                    };
            }
          }
          d.cursor = { number: to, hash: block.hash };
          if (d.rebuilding && to === safe) {
            d.orphanedJobs ??= {};
            for (const [id, j] of Object.entries(d.recoveryJobs ?? {}))
              if (!d.jobs[id]) d.orphanedJobs[id] = j;
            delete d.recoveryJobs;
            d.rebuilding = false;
          }
        });
      }
      const current = await this.store.read();
      if (current.rebuilding) return;
      for (const job of Object.values(current.jobs ?? {}) as any[]) {
        if (
          ["exécutée", "échouée", "refusée", "résultat non confirmé"].includes(
            job.status,
          )
        )
          continue;
        if (job.ack) {
          if (
            !(await this.c.home
              .commands(job.requestId)
              .then((r: any) => r.finalized))
          ) {
            const tx = await this.writer.recordCommandResult(
              job.ack,
              job.ack.signature,
            );
            const receipt = await tx.wait(this.c.confirmations);
            await this.store.mutate((d) => {
              d.jobs[job.requestId].resultTxHash = tx.hash;
              d.jobs[job.requestId].resultBlock = receipt.blockNumber;
            });
          }
          await this.store.mutate((d) => {
            d.jobs[job.requestId].status =
              job.ack.outcome === 1 ? "exécutée" : "échouée";
          });
          continue;
        }
        if (Number(job.deadline) * 1000 < Date.now()) {
          await this.store.mutate((d) => {
            d.jobs[job.requestId].status = job.attempts
              ? "résultat non confirmé"
              : "refusée";
          });
          continue;
        }
        if (!this.mqtt.connected) continue;
        if (!(await this.c.home.isCommandExecutable(job.requestId))) {
          await this.store.mutate((d) => {
            d.jobs[job.requestId].status = "refusée";
          });
          continue;
        }
        if (job.sentAt && Date.now() - job.sentAt < 5000) continue;
        const envelope = {
          protocolVersion: 1,
          chainId: this.c.chainId,
          registry: this.c.registry,
          requestId: job.requestId,
          deviceId: job.deviceId,
          action: job.action,
          requester: job.requester,
          permissionRevision: job.revision,
          issuedAt: Math.floor(Date.now() / 1000),
          expiresAt: job.deadline,
        };
        const signature = await this.signer.signTypedData(
          homeDomain(this.c.chainId, this.c.registry),
          commandTypes,
          envelope,
        );
        // Durable outbox: persisted before sending, retried with the same requestId.
        await this.store.mutate((d) => {
          Object.assign(d.jobs[job.requestId], {
            status: "transmise",
            sentAt: Date.now(),
            attempts: (job.attempts ?? 0) + 1,
          });
        });
        await this.mqtt.publishAsync(
          `${this.c.prefix}/${job.deviceId}/commands`,
          JSON.stringify({ ...envelope, signature }),
          { qos: 1, retain: false },
        );
      }
      this.lastError = null;
    } catch (e: any) {
      this.writer.runner?.reset?.();
      this.lastError =
        e.code === "NETWORK_ERROR"
          ? "RPC_UNAVAILABLE"
          : e.message === "CHAIN_REORG"
            ? "CHAIN_REORG"
            : "DEPENDENCY_UNAVAILABLE";
    } finally {
      this.running = false;
    }
  }
  async ack(topic: string, buffer: Buffer) {
    if (buffer.length > 8192) throw Error("MESSAGE_TOO_LARGE");
    const a = ackSchema.parse(JSON.parse(buffer.toString()));
    if (topic !== `${this.c.prefix}/${a.deviceId}/acks`)
      throw Error("WRONG_TOPIC");
    const d = await this.c.home.getDevice(a.deviceId);
    const cmd = await this.c.home.commands(a.requestId);
    if (
      same(cmd.requester, ZeroAddress) ||
      cmd.deviceId !== a.deviceId ||
      Number(cmd.action) !== a.action ||
      a.executedAt > Math.floor(Date.now() / 1000) ||
      a.executedAt > Number(cmd.deadline) ||
      a.executedAt < Number(d.registeredAt) ||
      a.deviceNonce < 1 ||
      stateHash(a.state) !== a.stateHash ||
      !signedBy(
        homeDomain(this.c.chainId, this.c.registry),
        ackTypes,
        a,
        a.signature,
        d.deviceSigner,
      )
    )
      throw Error("INVALID_SIGNATURE");
    await this.store.mutate((s) => {
      const j = s.jobs?.[a.requestId];
      if (!j) throw Error("UNKNOWN_REQUEST");
      if (j.ack) {
        if (j.ack.signature !== a.signature) throw Error("ACK_CONFLICT");
        return;
      }
      j.ack = a;
      if (!["exécutée", "échouée"].includes(j.status))
        j.status = "accusé authentifié";
    });
  }
}
