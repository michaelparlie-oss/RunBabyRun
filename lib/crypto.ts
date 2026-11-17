import crypto from "node:crypto";

/** HMAC-SHA256, hex. */
export function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const keyOf = (secret: string) => crypto.createHash("sha256").update(`enc:${secret}`).digest();

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, base64url parts. */
export function encrypt(plain: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
export function decrypt(blob: string, secret: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || ct == null) throw new Error("Bad ciphertext");
  const d = crypto.createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
