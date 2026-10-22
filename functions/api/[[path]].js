const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra }
  });
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function clientIdFrom(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : '';
}

async function leaderboard(request, env) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('limit'), 10) || 10));
  const clientId = clientIdFrom(url.searchParams.get('clientId'));

  const [rowsResult, totalResult] = await Promise.all([
    env.DB.prepare(
      `SELECT name, score, hair, title, created_at, client_id
       FROM scores
       ORDER BY score DESC, hair DESC, created_at ASC
       LIMIT ?`
    ).bind(limit).all(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM scores').first()
  ]);

  const entries = (rowsResult.results || []).map((row) => ({
    name: row.name,
    score: row.score,
    hair: row.hair,
    title: row.title,
    createdAt: row.created_at,
    mine: Boolean(clientId && row.client_id === clientId)
  }));

  return json({
    ok: true,
    total: Number(totalResult?.total || 0),
    entries
  });
}

async function submitScore(request, env) {
  if (Number(request.headers.get('content-length') || 0) > 4096) {
    return json({ ok: false, error: 'payload_too_large' }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const clientId = clientIdFrom(body?.clientId);
  const name = cleanText(body?.name, 8) || '长发骑士';
  const title = cleanText(body?.title, 24) || '加冕功臣';
  const score = Number(body?.score);
  const hair = Number(body?.hair);

  if (!clientId) return json({ ok: false, error: 'invalid_client' }, 400);
  if (!Number.isInteger(score) || score < 0 || score > 9999999) {
    return json({ ok: false, error: 'invalid_score' }, 400);
  }
  if (!Number.isInteger(hair) || hair < 0 || hair > 40) {
    return json({ ok: false, error: 'invalid_hair' }, 400);
  }
  if (score === 0 && hair === 0) {
    return json({ ok: false, error: 'empty_run' }, 400);
  }

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO scores (client_id, name, score, hair, title, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(clientId, name, score, hair, title, now),
    env.DB.prepare('UPDATE scores SET name = ? WHERE client_id = ?').bind(name, clientId),
    env.DB.prepare(
      `UPDATE scores
       SET score = ?, hair = ?, title = ?, created_at = ?
       WHERE client_id = ? AND (score < ? OR (score = ? AND hair < ?))`
    ).bind(score, hair, title, now, clientId, score, score, hair)
  ]);

  const best = await env.DB.prepare(
    'SELECT score, hair, title, created_at FROM scores WHERE client_id = ?'
  ).bind(clientId).first();
  const storedScore = best ? best.score : score;
  const storedHair = best ? best.hair : hair;
  const storedAt = best ? best.created_at : now;
  const [better, total] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM scores
       WHERE score > ? OR (score = ? AND hair > ?)
       OR (score = ? AND hair = ? AND created_at < ?)`
    ).bind(storedScore, storedScore, storedHair, storedScore, storedHair, storedAt).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM scores').first()
  ]);

  const rank = Number(better?.n || 0) + 1;
  return json({
    ok: true,
    rank,
    total: Number(total?.total || 0),
    best: best
      ? { score: best.score, hair: best.hair, title: best.title }
      : { score, hair, title }
  });
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return json({}, 204);
  if (!url.pathname.startsWith('/api/')) return json({ ok: false, error: 'not_found' }, 404);

  try {
    if (!env.DB) return json({ ok: false, error: 'database_not_bound' }, 500);
    if (url.pathname === '/api/health') {
      const row = await env.DB.prepare('SELECT 1 AS ok').first();
      return json({ ok: true, service: 'forty-hair-api', db: row });
    }
    if (url.pathname === '/api/leaderboard') {
      if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405, { allow: 'GET' });
      return leaderboard(request, env);
    }
    if (url.pathname === '/api/score') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, { allow: 'POST' });
      return submitScore(request, env);
    }
    return json({ ok: false, error: 'not_found' }, 404);
  } catch (error) {
    console.error('api_failure', error);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}
