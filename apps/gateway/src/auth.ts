import { randomBytes, createHash } from "node:crypto";
import { SiweMessage, generateNonce } from "siwe";
import type { Request, Response, NextFunction } from "express";
import { Store } from "../../../packages/shared/src/storage.ts";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function authService(store: Store, origins: string[], chainId: number) {
  const origin = (req: Request) => {
    const o = req.get("origin");
    if (!o || !origins.includes(o)) throw Error("INVALID_ORIGIN");
    return o;
  };
  return {
    async challenge(req: Request, res: Response) {
      const o = origin(req);
      const address = String(req.body.address);
      const now = new Date();
      const nonce = generateNonce();
      const message = new SiweMessage({
        domain: new URL(o).host,
        address,
        statement:
          "Connexion SmartHome G25 : acces a vos objets de demonstration.",
        uri: o,
        version: "1",
        chainId,
        nonce,
        issuedAt: now.toISOString(),
        expirationTime: new Date(+now + 300000).toISOString(),
      }).prepareMessage();
      await store.mutate((s) => {
        s.challenges ??= {};
        for (const [k, v] of Object.entries(s.challenges) as any)
          if (v.expires < Date.now()) delete s.challenges[k];
        s.challenges[nonce] = { message, origin: o, expires: +now + 300000 };
      });
      res.json({ message });
    },
    async verify(req: Request, res: Response) {
      const o = origin(req);
      const m = new SiweMessage(req.body.message);
      const pending = (await store.read()).challenges?.[m.nonce];
      if (
        !pending ||
        pending.origin !== o ||
        pending.message !== req.body.message ||
        pending.expires < Date.now() ||
        m.chainId !== chainId
      )
        throw Error("INVALID_NONCE");
      const verified = await m.verify({
        signature: req.body.signature,
        domain: new URL(o).host,
        nonce: m.nonce,
      });
      if (!verified.success) throw Error("INVALID_SIGNATURE");
      const token = randomBytes(32).toString("hex");
      await store.mutate((s) => {
        if (!s.challenges[m.nonce]) throw Error("INVALID_NONCE");
        delete s.challenges[m.nonce];
        s.sessions ??= {};
        for (const [k, v] of Object.entries(s.sessions) as any)
          if (v.expires < Date.now()) delete s.sessions[k];
        s.sessions[tokenHash(token)] = {
          address: m.address,
          expires: Date.now() + 900000,
        };
      });
      res.json({ token, expiresIn: 900, address: m.address });
    },
    async middleware(req: Request, res: Response, next: NextFunction) {
      try {
        const token = req.get("authorization")?.replace(/^Bearer /, "") ?? "";
        const session = (await store.read()).sessions?.[tokenHash(token)];
        if (!session || session.expires < Date.now()) {
          res.status(401).json({
            code: "WALLET_REQUIRED",
            message: "Session absente ou expirée",
          });
          return;
        }
        res.locals.address = session.address;
        res.locals.tokenHash = tokenHash(token);
        next();
      } catch (e) {
        next(e);
      }
    },
  };
}
