export const enterpriseStore = {
  async capture(data, bucket, env) {
    const db = env.INVEST_ENTERPRISE_REQUESTS;
    const [, rate] = await db.batch([
      db.prepare("DELETE FROM enterprise_rate_limits WHERE expires_at < unixepoch()"),
      db.prepare(`INSERT INTO enterprise_rate_limits (bucket, expires_at) VALUES (?, unixepoch() + 660)
        ON CONFLICT (bucket) DO UPDATE SET hits = hits + 1 RETURNING hits`).bind(bucket),
      db.prepare(`INSERT INTO enterprise_requests
        (id, name, email, company_name, team_size, enterprise_goal, is_test)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT hits FROM enterprise_rate_limits WHERE bucket = ?) <= 8
        ON CONFLICT (email, is_test) DO NOTHING`).bind(
        crypto.randomUUID(), data.name, data.email, data.companyName, data.teamSize,
        data.enterpriseGoal, env.INTEREST_TEST_MODE === "true" ? 1 : 0, bucket,
      ),
    ]);
    if (rate.results[0].hits > 8) throw new Error("RATE_LIMIT");
  },
  async list({ status, page, search }, env) {
    const db = env.INVEST_ENTERPRISE_REQUESTS;
    const term = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
    const where = `is_test = 0 AND (?1 = '' OR status = ?1) AND (
      name LIKE ?2 ESCAPE '\\' OR email LIKE ?2 ESCAPE '\\' OR company_name LIKE ?2 ESCAPE '\\')`;
    const [count, records] = await db.batch([
      db.prepare(`SELECT count(*) AS count FROM enterprise_requests WHERE ${where}`).bind(status, term),
      db.prepare(`SELECT id, name, email, 'empresarial' AS interest, company_name, team_size, enterprise_goal,
        status, notes, version, created_at, updated_at FROM enterprise_requests WHERE ${where}
        ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET ?3`).bind(status, term, (page - 1) * 25),
    ]);
    return { contacts: records.results, total: count.results[0].count, page };
  },
  async update(data, identity, env) {
    const row = await env.INVEST_ENTERPRISE_REQUESTS.prepare(`UPDATE enterprise_requests
      SET status = ?, notes = ?, version = version + 1, updated_by = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND version = ? AND is_test = 0 RETURNING id`)
      .bind(data.status, data.notes, identity.subject, data.id, data.version).first();
    return !!row;
  },
};

export const enterpriseQueue = {
  async claim(env) {
    return env.INVEST_ENTERPRISE_REQUESTS.prepare(`UPDATE enterprise_notices
      SET attempts = attempts + 1, next_attempt_at = unixepoch() + 300
      WHERE interest_id = (SELECT interest_id FROM enterprise_notices
        WHERE sent_at IS NULL AND attempts < 8 AND next_attempt_at <= unixepoch()
        ORDER BY created_at, interest_id LIMIT 1)
      RETURNING interest_id, attempts`).first();
  },
  async finish(item, ok, env) {
    const change = ok ? "sent_at = unixepoch()" : "next_attempt_at = unixepoch() + min(attempts * 300, 3600)";
    return env.INVEST_ENTERPRISE_REQUESTS.prepare(`UPDATE enterprise_notices SET ${change}
      WHERE interest_id = ? AND attempts = ?`).bind(item.interest_id, item.attempts).run();
  },
};
