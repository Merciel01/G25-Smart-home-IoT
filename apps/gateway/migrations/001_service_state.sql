-- État durable du prototype de trois objets. Les maps JSONB sont indexées par
-- eventId/requestId/nonce ; une mutation sous verrou de ligne est atomique.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_state (
  scope text PRIMARY KEY,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object')
);
INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
