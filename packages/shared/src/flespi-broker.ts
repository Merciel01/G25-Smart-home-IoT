import { randomBytes } from "node:crypto";
export function flespiProbePrefix() {
  return "g25/probe-" + randomBytes(16).toString("hex");
}
export class FlespiBroker {
  constructor(
    private token: string,
    private prefix: string,
    private request: typeof fetch = fetch,
  ) {
    if (!token || !/^[A-Za-z0-9/_-]+$/.test(prefix))
      throw Error("FLESPI_CONFIGURATION_INVALID");
  }
  private async api(method: string, path: string, body?: unknown) {
    let response: Response;
    try {
      response = await this.request("https://flespi.io" + path, {
        method,
        headers: {
          Authorization: "FlespiToken " + this.token,
          "Content-Type": "application/json",
          "x-flespi-app": "SmartHome-G25",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
    } catch {
      throw Error("FLESPI_UNAVAILABLE");
    }
    if (!response.ok) throw Error("FLESPI_HTTP_" + response.status);
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw Error("FLESPI_INVALID_RESPONSE");
    }
    if (data.errors?.length || !Array.isArray(data.result))
      throw Error("FLESPI_RESPONSE_ERROR");
    return data.result;
  }
  async checkConfiguration() {
    const info = (await this.api("GET", "/auth/info"))[0];
    if (info?.access?.type !== 1) throw Error("FLESPI_MASTER_REQUIRED");
    return { cid: info.cid };
  }
  rules(id: string, gateway = false) {
    if (!gateway && !/^0x[a-f0-9]{64}$/.test(id))
      throw Error("FLESPI_DEVICE_ID_INVALID");
    const root = `${this.prefix}/${gateway ? "+" : id}`;
    return [
      {
        uri: "mqtt",
        topic: root + "/commands",
        actions: [gateway ? "publish" : "subscribe"],
        methods: [],
      },
      ...["acks", "status"].map((suffix) => ({
        uri: "mqtt",
        topic: root + "/" + suffix,
        actions: [gateway ? "subscribe" : "publish"],
        methods: [],
      })),
    ];
  }
  async ensureDevice(
    device: { id: string; credentials?: unknown },
    gateway = false,
  ) {
    const rules = this.rules(device.id, gateway);
    const marker = `G25:${this.prefix}:${gateway ? "gateway" : device.id}`;
    const entries = await this.api(
      "GET",
      "/platform/tokens/all?fields=id,info",
    );
    const matches = entries.filter((item: any) => item.info === marker);
    if (matches.length > 1) throw Error("FLESPI_IDENTITY_CONFLICT");
    let result: any;
    if (matches.length)
      result = (await this.api("GET", "/platform/tokens/" + matches[0].id))[0];
    else
      result = (
        await this.api("POST", "/platform/tokens", [
          {
            info: marker,
            ttl: 2592000,
            enabled: true,
            origins: [],
            access: { type: 2, acl: rules },
          },
        ])
      )[0];
    // Re-read: never activate a token whose permissions have not been confirmed.
    if (!Number.isSafeInteger(result?.id))
      throw Error("FLESPI_IDENTITY_INVALID");
    const verified = (
      await this.api("GET", "/platform/tokens/" + result.id)
    )[0];
    const normalize = (list: any[]) =>
      list.map((r: any) => ({
        uri: r.uri,
        topic: r.topic,
        actions: r.actions,
        methods: r.methods,
      }));
    if (
      verified?.info !== marker ||
      verified.access?.type !== 2 ||
      verified.enabled !== true ||
      !verified.key ||
      !Array.isArray(verified.access.acl) ||
      JSON.stringify(normalize(verified.access.acl)) !==
        JSON.stringify(normalize(rules))
    )
      throw Error("FLESPI_ACL_NOT_CONFIRMED");
    return {
      credentials: { username: verified.key, password: "" },
      remoteTokenId: verified.id,
    };
  }
  async removeDeviceToken(id: string, tokenId: number) {
    if (id === "gateway" && !/^g25\/probe-[a-f0-9]{32}$/.test(this.prefix))
      throw Error("FLESPI_GATEWAY_DELETE_REFUSED");
    if (!Number.isSafeInteger(tokenId)) throw Error("FLESPI_IDENTITY_INVALID");
    const item = (await this.api("GET", "/platform/tokens/" + tokenId))[0];
    if (item?.info !== `G25:${this.prefix}:${id}` || item.access?.type !== 2)
      throw Error("FLESPI_DELETE_REFUSED");
    await this.api("DELETE", "/platform/tokens/" + tokenId);
  }
}
