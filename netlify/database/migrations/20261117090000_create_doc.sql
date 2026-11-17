-- One row per JSON document a runner owns (account, profile, plan, activities, logs…).
CREATE TABLE IF NOT EXISTS doc (
  owner TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner, key)
);
