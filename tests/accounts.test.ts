import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteLogin, sendReset, signIn, signUp, validEmail, validPassword } from "@/lib/auth";
import { memoryStore, setStoreForTests } from "@/lib/storage";
import { linkStrava, loadUser, uidForAuth, uidForStrava, unlinkAuth, unlinkStrava, userForAuth } from "@/lib/users";

beforeEach(() => { setStoreForTests(memoryStore()); process.env.SUPABASE_URL = "https://abc.supabase.co"; process.env.SUPABASE_PUBLISHABLE_KEY = "k"; });
afterEach(() => { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; });

const reply = (status: number, body: unknown) => (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
let calls: { url: string; init: RequestInit }[] = [];
beforeEach(() => { calls = []; });
const U = { id: "11111111-2222-4333-8444-555555555555", email: "ana@example.com", user_metadata: { name: "Ana" } };

describe("sign-in service", () => {
  it("validates email and password shape", () => {
    expect(validEmail("a@b.co")).toBe(true);
    expect(validEmail("a b@c.co")).toBe(false);
    expect(validPassword("1234567")).toBe(false);
    expect(validPassword("12345678")).toBe(true);
  });

  it("signs up, with and without email confirmation", async () => {
    const now = await signUp("ana@example.com", "password1", "Ana", "https://x/auth/callback", reply(200, { access_token: "t", user: U }));
    expect(now).toEqual({ ok: true, value: { user: { id: U.id, email: U.email, name: "Ana" }, signedIn: true } });
    expect(calls[0].url).toBe("https://abc.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Fx%2Fauth%2Fcallback");
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe("k");
    const later = await signUp("ana@example.com", "password1", "Ana", "https://x", reply(200, { ...U, identities: [{}] }));
    expect(later).toEqual({ ok: true, value: { user: null, signedIn: false } });
    expect(await signUp("ana@example.com", "password1", "Ana", "https://x", reply(200, { ...U, identities: [] }))).toEqual({ ok: false, error: "exists" });
  });

  it("maps Supabase errors to plain reasons", async () => {
    expect(await signIn("a@b.co", "x", reply(400, { error_code: "invalid_credentials" }))).toEqual({ ok: false, error: "invalid" });
    expect(await signIn("a@b.co", "x", reply(400, { error_code: "email_not_confirmed" }))).toEqual({ ok: false, error: "unconfirmed" });
    expect(await signIn("a@b.co", "x", reply(429, {}))).toEqual({ ok: false, error: "rate" });
    expect(await signUp("a@b.co", "password1", "A", "https://x", reply(422, { error_code: "user_already_exists" }))).toEqual({ ok: false, error: "exists" });
    expect(await signUp("a@b.co", "password1", "A", "https://x", reply(400, { error_code: "email_address_not_authorized" }))).toEqual({ ok: false, error: "email_send" });
    expect(await sendReset("a@b.co", "https://x", (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toEqual({ ok: false, error: "network" });
    delete process.env.SUPABASE_URL;
    expect(await signIn("a@b.co", "x", reply(200, {}))).toEqual({ ok: false, error: "not_configured" });
  });

  it("deletes the login as the signed-in user", async () => {
    expect(await deleteLogin("jwt", reply(200, {}))).toBe(true);
    expect(calls[0].url).toBe("https://abc.supabase.co/rest/v1/rpc/delete_own_account");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
  });
});

describe("accounts", () => {
  it("gives each login one stable runner id, far from Strava athlete numbers", async () => {
    const a = await userForAuth(U.id, "ana@example.com", "Ana");
    const again = await userForAuth(U.id, "ana@new.example.com", "");
    const b = await userForAuth("99999999-2222-4333-8444-555555555555", "b@example.com", "");
    expect(a.uid).toBeGreaterThanOrEqual(1e12);
    expect(Number.isSafeInteger(a.uid)).toBe(true);
    expect(again.uid).toBe(a.uid);
    expect(again.email).toBe("ana@new.example.com");
    expect(again.name).toBe("Ana");
    expect(b.uid).not.toBe(a.uid);
    expect(b.name).toBe("b");
    expect(a.source).toBeNull();
    expect(await uidForAuth(U.id)).toBe(a.uid);
    await unlinkAuth(U.id);
    expect(await uidForAuth(U.id)).toBeNull();
    expect((await loadUser(a.uid))?.email).toBe("ana@new.example.com");
  });

  it("links a Strava athlete to exactly one runner", async () => {
    expect(await linkStrava(77, 1e12 + 1)).toBe(true);
    expect(await linkStrava(77, 1e12 + 1)).toBe(true);
    expect(await linkStrava(77, 1e12 + 2)).toBe(false);
    await unlinkStrava(77, 1e12 + 2); // someone else's link is left alone
    expect(await uidForStrava(77)).toBe(1e12 + 1);
    await unlinkStrava(77, 1e12 + 1);
    expect(await linkStrava(77, 1e12 + 2)).toBe(true);
  });
});
