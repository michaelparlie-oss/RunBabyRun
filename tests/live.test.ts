import { afterEach, describe, expect, it, vi } from "vitest";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
import { liveConfig, liveTopic, publishChange } from "@/lib/live";

afterEach(() => { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; });

describe("live updates", () => {
  it("is off without configuration", async () => {
    const f = vi.fn();
    expect(await liveConfig(1)).toBeNull();
    expect(await publishChange(1, f as unknown as typeof fetch)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("gives each runner a stable topic that does not reveal the athlete id", async () => {
    const a = await liveTopic(12345), b = await liveTopic(12346);
    expect(a).toBe(await liveTopic(12345));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^rbr-[a-f0-9]{40}$/);
    expect(a).not.toContain("12345");
  });

  it("publishes an empty ping to the runner's topic and nothing personal", async () => {
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    const f = vi.fn(async () => new Response(null, { status: 202 }));
    expect(await publishChange(777, f as unknown as typeof fetch)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://abc.supabase.co/realtime/v1/api/broadcast");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].topic).toBe(await liveTopic(777));
    expect(Object.keys(body.messages[0].payload)).toEqual(["at"]);
    expect(init.body as string).not.toContain("777");
  });

  it("never throws when Supabase is unreachable, and ignores a non-Supabase URL", async () => {
    process.env.SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "k";
    expect(await publishChange(1, (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBe(false);
    process.env.SUPABASE_URL = "https://evil.example.com";
    expect(await liveConfig(1)).toBeNull();
  });
});
