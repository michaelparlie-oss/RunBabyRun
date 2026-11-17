# Moving storage to Netlify Database (Postgres)

RunBabyRun ships on Netlify Blobs: no setup and no extra cost. Blobs is a key-value store without queries or
transactions, which is enough while each runner only ever reads and writes their own few documents. Move to Netlify
Database when you have many runners or want to query across them (for example, to count active users).

**Cost and plan:** Netlify Database is available on credit-based plans and an active database consumes credits. Installing
`@netlify/database` makes Netlify provision a database automatically on the next deploy, which is why the package is
**not** installed by default. Check your plan and pricing first.

## Steps

1. `npm install @netlify/database`
2. Add the migration `netlify/database/migrations/20261117090000_create_doc.sql`:

```sql
-- One row per JSON document a runner owns (account, profile, plan, activities, logs…).
CREATE TABLE IF NOT EXISTS doc (
  owner TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner, key)
);
```

3. Add this backend to `lib/storage/index.ts` and return it from `getStore()` when `process.env.NETLIFY_DB_URL` is set:

```ts
async function pgStore(): Promise<DocStore> {
  const { getDatabase } = await import("@netlify/database");
  const db = getDatabase();
  return {
    kind: "netlify-database",
    async get(o, key) { check(o, key); const r = await db.sql<{ value: unknown }>`SELECT value FROM doc WHERE owner = ${o} AND key = ${key}`; return r.length ? (r[0].value as never) : null; },
    async set(o, key, value) {
      check(o, key);
      const v = JSON.stringify(value);
      await db.sql`INSERT INTO doc (owner, key, value) VALUES (${o}, ${key}, ${v}::jsonb) ON CONFLICT (owner, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    },
    async setIfNew(o, key, value) {
      check(o, key);
      const v = JSON.stringify(value);
      const r = await db.sql<{ key: string }>`INSERT INTO doc (owner, key, value) VALUES (${o}, ${key}, ${v}::jsonb) ON CONFLICT (owner, key) DO NOTHING RETURNING key`;
      return r.length > 0;
    },
    async del(o, key) { check(o, key); await db.sql`DELETE FROM doc WHERE owner = ${o} AND key = ${key}`; },
    async delAll(o) { check(o, "x"); await db.sql`DELETE FROM doc WHERE owner = ${o}`; },
  };
}
```

4. Deploy. Netlify provisions the database and applies the migration. `/api/health` should then report
   `"storage": "netlify-database"`.

Existing runners' data stays in Blobs and is not copied automatically. Either copy the documents across with a one-off
script (list the `runbabyrun` blob store, insert each `owner/key` into `doc`), or ask runners to reconnect and redo the
questionnaire, which takes about two minutes.
