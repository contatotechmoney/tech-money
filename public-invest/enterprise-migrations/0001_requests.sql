CREATE TABLE enterprise_requests (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  company_name TEXT NOT NULL CHECK (length(company_name) BETWEEN 2 AND 150),
  team_size TEXT NOT NULL CHECK (team_size IN ('1-5', '6-20', '21-50', '51+', 'unknown')),
  enterprise_goal TEXT CHECK (length(enterprise_goal) <= 500),
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contatado','reuniao','proposta','concluido','arquivado')),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  version INTEGER NOT NULL DEFAULT 0,
  is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (email, is_test)
) STRICT;

CREATE TABLE enterprise_rate_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1 CHECK (hits > 0),
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE enterprise_notices (
  interest_id TEXT PRIMARY KEY NOT NULL REFERENCES enterprise_requests(id),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

CREATE TRIGGER enterprise_enqueue_notice AFTER INSERT ON enterprise_requests
WHEN NEW.is_test = 0 BEGIN
  INSERT INTO enterprise_notices (interest_id) VALUES (NEW.id);
END;

CREATE TABLE enterprise_audit (
  sequence INTEGER PRIMARY KEY,
  interest_id TEXT NOT NULL REFERENCES enterprise_requests(id),
  actor TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TRIGGER enterprise_audit_update AFTER UPDATE ON enterprise_requests
WHEN NEW.version > OLD.version AND NEW.updated_by IS NOT NULL BEGIN
  INSERT INTO enterprise_audit (interest_id, actor, previous_status, next_status)
  VALUES (NEW.id, NEW.updated_by, OLD.status, NEW.status);
END;
