import { FlespiBroker } from "./flespi-broker.ts";
/** EMQX v5-compatible management API. No credentials or API response bodies in errors. */
export class ExternalBroker {
  private base: string;
  constructor(
    url: string,
    private key: string,
    private secret: string,
    private prefix: string,
    private request: typeof fetch = fetch,
  ) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !key ||
      !secret ||
      !/^[A-Za-z0-9/_-]+$/.test(prefix)
    )
      throw Error("BROKER_CONFIGURATION_INVALID");
    this.base = parsed.href.replace(/\/$/, "");
  }
  private async api(
    method: string,
    path: string,
    body?: unknown,
    missing = false,
  ) {
    let response: Response;
    try {
      response = await this.request(this.base + "/api/v5" + path, {
        method,
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(this.key + ":" + this.secret).toString("base64"),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw Error("BROKER_MANAGEMENT_UNAVAILABLE");
    }
    if (missing && response.status === 404) return null;
    if (!response.ok) throw Error("BROKER_MANAGEMENT_HTTP_" + response.status);
    if (response.status === 204) return {};
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw Error("BROKER_MANAGEMENT_INVALID_RESPONSE");
    }
  }
  async checkConfiguration() {
    const auth = await this.api("GET", "/authentication");
    const enabled = Array.isArray(auth)
      ? auth.filter((a: any) => a.enable)
      : [];
    if (
      enabled.length !== 1 ||
      enabled[0].id !== "password_based:built_in_database" ||
      enabled[0].user_id_type !== "username"
    )
      throw Error("BROKER_AUTHENTICATION_CONFIGURATION_REQUIRED");
    const authz = await this.api("GET", "/authorization/sources");
    const sources = Array.isArray(authz?.sources)
      ? authz.sources
      : Array.isArray(authz)
        ? authz
        : [];
    if (sources.filter((s: any) => s.enable)[0]?.type !== "built_in_database")
      throw Error("BROKER_AUTHORIZATION_CONFIGURATION_REQUIRED");
    const settings = await this.api("GET", "/authorization/settings");
    if (settings.no_match !== "deny")
      throw Error("BROKER_DEFAULT_DENY_REQUIRED");
  }
  async removeProbe(username: string) {
    if (!/^probe-[a-f0-9]{32}$/.test(username))
      throw Error("BROKER_PROBE_ID_INVALID");
    await this.api(
      "DELETE",
      "/authentication/password_based%3Abuilt_in_database/users/" + username,
      undefined,
      true,
    );
    await this.api(
      "DELETE",
      "/authorization/sources/built_in_database/rules/users/" + username,
      undefined,
      true,
    );
  }
  rules(deviceId: string, gateway = false) {
    if (!/^0x[a-f0-9]{64}$/.test(deviceId) && !gateway)
      throw Error("BROKER_DEVICE_ID_INVALID");
    const topic = `${this.prefix}/${gateway ? "+" : deviceId}`;
    return [
      {
        permission: "allow",
        action: gateway ? "publish" : "subscribe",
        topic: (gateway ? "" : "eq ") + topic + "/commands",
        ...(gateway ? { retain: "false" } : {}),
      },
      ...["acks", "status"].map((suffix) => ({
        permission: "allow",
        action: gateway ? "subscribe" : "publish",
        topic: (gateway ? "eq " : "") + topic + "/" + suffix,
        ...(!gateway ? { retain: "false" } : {}),
      })),
      { permission: "deny", action: "all", topic: "#" },
    ];
  }
  async ensureDevice(
    device: { id: string; credentials: { username: string; password: string } },
    gateway = false,
  ) {
    const { username, password } = device.credentials;
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(username) ||
      !password ||
      password.length < 32
    )
      throw Error("BROKER_CREDENTIALS_INVALID");
    await this.checkConfiguration();
    const userPath =
      "/authentication/password_based%3Abuilt_in_database/users/" +
      encodeURIComponent(username);
    const existing = await this.api("GET", userPath, undefined, true);
    if (
      existing &&
      (existing.user_id !== username || existing.is_superuser !== false)
    )
      throw Error("BROKER_EXISTING_USER_UNSAFE");
    const rules = this.rules(device.id, gateway);
    const rulePath =
      "/authorization/sources/built_in_database/rules/users/" +
      encodeURIComponent(username);
    const currentRules = await this.api("GET", rulePath, undefined, true);
    // ACLs are installed before authentication is enabled for a new identity.
    if (currentRules) await this.api("PUT", rulePath, { username, rules });
    else
      await this.api(
        "POST",
        "/authorization/sources/built_in_database/rules/users",
        [{ username, rules }],
      );
    if (existing)
      await this.api("PUT", userPath, { password, is_superuser: false });
    else
      await this.api(
        "POST",
        "/authentication/password_based%3Abuilt_in_database/users",
        { user_id: username, password, is_superuser: false },
      );
    const checkedUser = await this.api("GET", userPath);
    const checkedRules = await this.api("GET", rulePath);
    if (
      checkedUser.user_id !== username ||
      checkedUser.is_superuser !== false ||
      !Array.isArray(checkedRules.rules) ||
      checkedRules.rules.length !== rules.length ||
      !rules.every((rule, index) =>
        Object.entries(rule).every(
          ([key, value]) => checkedRules.rules[index][key] === value,
        ),
      )
    )
      throw Error("BROKER_PROVISIONING_NOT_CONFIRMED");
  }
}
export function externalBroker() {
  if (process.env.BROKER_PROVISIONING_DRIVER === "flespi") return new FlespiBroker(process.env.FLESPI_TOKEN ?? "", process.env.MQTT_PREFIX ?? "g25/home01");
  if (process.env.BROKER_PROVISIONING_DRIVER !== "emqx")
    throw Error("BROKER_PROVISIONER_NOT_CONFIGURED");
  return new ExternalBroker(
    process.env.BROKER_API_URL ?? "",
    process.env.BROKER_API_KEY ?? "",
    process.env.BROKER_API_SECRET ?? "",
    process.env.MQTT_PREFIX ?? "g25/home01",
  );
}
