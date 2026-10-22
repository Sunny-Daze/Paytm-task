#!/usr/bin/env node
// On-sale stampede against a running instance. No dependencies, Node >= 18.
//
//   ./burst.sh <BASE_URL> [--users 1000] [--seats 200] [--hot-seats 3]
//              [--limit 4] [--login-concurrency 100] [--no-confirm]
//
// Phases: hot-seat storm -> general stampede -> idempotent retries ->
// per-user limit -> confirm winners -> reconciliation. Exits 1 if any
// correctness check fails, so it can gate a deploy.

const USAGE = "usage: ./burst.sh <BASE_URL> [--users N] [--seats N] [--hot-seats N] [--limit N] [--login-concurrency N] [--no-confirm]";

const parseArgs = (argv) => {
  const opts = { users: 1000, seats: 200, hotSeats: 3, limit: 4, loginConcurrency: 100, confirm: true };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value <= 0) throw new Error(`${arg} needs a positive integer`);
      return value;
    };
    if (arg === "--users") opts.users = next();
    else if (arg === "--seats") opts.seats = next();
    else if (arg === "--hot-seats") opts.hotSeats = next();
    else if (arg === "--limit") opts.limit = next();
    else if (arg === "--login-concurrency") opts.loginConcurrency = next();
    else if (arg === "--no-confirm") opts.confirm = false;
    else if (arg === "-h" || arg === "--help") { console.log(USAGE); process.exit(0); }
    else if (arg.startsWith("--")) throw new Error(`unknown flag ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) throw new Error(USAGE);
  const base = positional[0].replace(/\/+$/, "");
  opts.api = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
  if (opts.hotSeats > opts.seats) throw new Error("--hot-seats cannot exceed --seats");
  if (opts.hotSeats + opts.limit * 2 + 1 > opts.seats) {
    throw new Error("--seats must exceed --hot-seats + 2 x --limit");
  }
  return opts;
};

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

// ---------------------------------------------------------------- HTTP

const REQUEST_TIMEOUT_MS = 30_000;

const request = async (method, path, { token, body, phase } = {}) => {
  const started = performance.now();
  try {
    const res = await fetch(`${opts.api}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
    return {
      phase,
      status: res.status,
      code: json?.code ?? null,
      data: json?.data ?? null,
      replayed: res.headers.get("idempotent-replayed") === "true",
      ms: performance.now() - started,
    };
  } catch (err) {
    return { phase, status: 0, code: err.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR", data: null, replayed: false, ms: performance.now() - started, error: err.message };
  }
};

const mapLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};

// ---------------------------------------------------------------- reporting

const outcomeLabel = (r) => {
  if (r.status === 0) return `network error (${r.code})`;
  if (r.status >= 500) return `5xx (${r.status})`;
  if (r.status === 201 && r.replayed) return "idempotent replay";
  if (r.status === 201) return "reserved (held)";
  if (r.status === 200 && r.data?.status === "confirmed") return r.replayed ? "confirmed (replay)" : "confirmed";
  if (r.status === 409) return `declined: ${r.code ?? "409"}`;
  return `${r.status}${r.code ? ` ${r.code}` : ""}`;
};

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const allResults = [];

const runPhase = async (name, fn) => {
  const started = performance.now();
  const results = await fn();
  const wallMs = performance.now() - started;
  allResults.push(...results);

  const counts = new Map();
  results.forEach((r) => counts.set(outcomeLabel(r), (counts.get(outcomeLabel(r)) ?? 0) + 1));
  const ms = results.map((r) => r.ms);

  console.log(`\n== ${name} ==  ${results.length} requests in ${wallMs.toFixed(0)} ms (${(results.length / (wallMs / 1000)).toFixed(0)} req/s)`);
  console.log(`   latency p50 ${percentile(ms, 50).toFixed(0)} ms | p95 ${percentile(ms, 95).toFixed(0)} ms | p99 ${percentile(ms, 99).toFixed(0)} ms`);
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, n]) => console.log(`   ${String(n).padStart(7)}  ${label}`));
  return results;
};

const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

// ---------------------------------------------------------------- scenario

const runId = Date.now().toString(36);
const key = (label) => `burst-${runId}-${label}`;
const rowLetter = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
const seatLabels = Array.from({ length: opts.seats }, (_, i) => `${rowLetter(Math.floor(i / 20))}${(i % 20) + 1}`);
// Hot seats are the "good" middle seats of the front rows (A12, A13, B12, ...)
const preferred = ["A12", "A13", "B12", "B13", "A11", "A14", "C12", "C13"].filter((s) => seatLabels.includes(s));
const hotSeats = [...preferred, ...seatLabels.filter((s) => !preferred.includes(s))].slice(0, opts.hotSeats);
// Kept out of the stampede so the per-user limit phase always has free seats
const limitSeats = seatLabels.filter((s) => !hotSeats.includes(s)).slice(-opts.limit * 2);
const coldSeats = seatLabels.filter((s) => !hotSeats.includes(s) && !limitSeats.includes(s));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

console.log(`burst ${runId} -> ${opts.api}`);
console.log(`users ${opts.users} | seats ${opts.seats} | hot seats ${hotSeats.join(",")} | per-user limit ${opts.limit} | confirm ${opts.confirm}`);

const ready = await request("GET", "/health/ready");
console.log(`readiness: ${ready.status} ${ready.status === 0 ? ready.error : ""}`);
if (ready.status === 0) process.exit(1);

// --- setup
const loginUser = async (name, role) => {
  const r = await request("POST", "/auth/login", { body: { username: name, ...(role && { role }) } });
  if (r.status !== 200 || !r.data?.token) throw new Error(`login ${name} failed: ${r.status} ${r.code ?? ""}`);
  return { name, token: r.data.token };
};

const setupStart = performance.now();
const admin = await loginUser(key("admin"), "admin");
const created = await request("POST", "/shows", {
  token: admin.token,
  body: { name: key("show"), seats: seatLabels, price_paise: 25000, per_user_limit: opts.limit },
});
if (![200, 201].includes(created.status) || !created.data?.id) {
  console.error(`create show failed: ${created.status} ${created.code ?? ""}`);
  process.exit(1);
}
const showId = created.data.id;
const users = await mapLimit(
  Array.from({ length: opts.users + 1 }, (_, i) => key(`u${i}`)),
  opts.loginConcurrency,
  (name) => loginUser(name),
);
const limitUser = users.pop(); // reserved for the per-user limit phase
console.log(`setup: show ${showId}, ${users.length + 1} users logged in (${(performance.now() - setupStart).toFixed(0)} ms)`);

const reserve = (user, seats, idemKey, phase) =>
  request("POST", `/shows/${showId}/reserve`, { token: user.token, body: { seats, idempotency_key: idemKey }, phase })
    .then((r) => ({ ...r, user: user.name, seats, idemKey }));

// --- 1. hot-seat storm: every user goes for a hot seat at once; ~10% also
// fire an identical in-flight retry (same key) to exercise idempotency
const hot = await runPhase(`hot-seat storm (${users.length} users -> ${hotSeats.join(",")})`, () =>
  Promise.all(
    users.flatMap((user, i) => {
      const seats = [hotSeats[i % hotSeats.length]];
      const idemKey = key(`hot-${i}`);
      const first = reserve(user, seats, idemKey, "hot");
      return i % 10 === 0 ? [first, reserve(user, seats, idemKey, "hot")] : [first];
    }),
  ),
);

// --- 2. general stampede: everyone grabs 1-2 random seats at once
const stampede = await runPhase(`stampede (${users.length} users, 1-2 random seats each)`, () =>
  Promise.all(
    users.map((user, i) => {
      const seats = [...new Set([pick(coldSeats), ...(Math.random() < 0.3 ? [pick(coldSeats)] : [])])];
      return reserve(user, seats, key(`st-${i}`), "stampede");
    }),
  ),
);

const wins = [...hot, ...stampede].filter((r) => r.status === 201 && !r.replayed);

// --- 3. retries: identical retry must replay; same key + different seats must 409
const sample = wins.slice(0, 200);
const retries = await runPhase(`idempotent retries (${sample.length} replays + ${sample.length} key reuses)`, () =>
  Promise.all(
    sample.flatMap((win) => {
      const user = users.find((u) => u.name === win.user);
      const otherSeat = coldSeats.find((s) => !win.seats.includes(s));
      return [
        reserve(user, win.seats, win.idemKey, "retry"),
        reserve(user, [otherSeat], win.idemKey, "reuse"),
      ];
    }),
  ),
);

// --- 4. per-user limit: one user fires 2x limit parallel single-seat requests
const limitRun = await runPhase(`per-user limit (1 user, ${limitSeats.length} parallel requests, limit ${opts.limit})`, () =>
  Promise.all(limitSeats.map((seat, i) => reserve(limitUser, [seat], key(`lim-${i}`), "limit"))),
);

// --- 5. confirm every winning hold
const allWins = [...wins, ...limitRun.filter((r) => r.status === 201 && !r.replayed)];
let confirms = [];
if (opts.confirm) {
  const tokenOf = new Map([...users, limitUser].map((u) => [u.name, u.token]));
  confirms = await runPhase(`confirm (${allWins.length} holds)`, () =>
    Promise.all(
      allWins.map((win) =>
        request("POST", `/reservations/${win.data.reservation_id}/confirm`, { token: tokenOf.get(win.user), phase: "confirm" }),
      ),
    ),
  );
}

// ---------------------------------------------------------------- checks

const server5xx = allResults.filter((r) => r.status >= 500);
const networkErrors = allResults.filter((r) => r.status === 0);
check("zero 5xx across the burst", server5xx.length === 0, `${server5xx.length} responses`);
check("no network errors / timeouts", networkErrors.length === 0, `${networkErrors.length} requests`);

// Each hot seat: exactly one reservation id across all 201s (replays share it)
hotSeats.forEach((seat) => {
  const ids = new Set(hot.filter((r) => r.status === 201 && r.seats[0] === seat).map((r) => r.data.reservation_id));
  const losers = hot.filter((r) => r.seats[0] === seat && r.status === 409).length;
  check(`hot seat ${seat}: exactly one winner`, ids.size === 1, `${ids.size} winning reservation(s), ${losers} declined with 409`);
});

// No seat granted to two different reservations
const seatOwners = new Map();
[...hot, ...stampede, ...limitRun]
  .filter((r) => r.status === 201)
  .forEach((r) => r.seats.forEach((s) => seatOwners.set(s, (seatOwners.get(s) ?? new Set()).add(r.data.reservation_id))));
const doubleSold = [...seatOwners].filter(([, ids]) => ids.size > 1).map(([s]) => s);
check("no seat held/confirmed by two reservations", doubleSold.length === 0, doubleSold.join(",") || `${seatOwners.size} seats granted once each`);

const replays = retries.filter((r) => r.phase === "retry");
const replayMismatch = replays.filter((r, i) => r.status !== 201 || r.data?.reservation_id !== sample[i].data.reservation_id);
check("identical retries return the original reservation", replayMismatch.length === 0, `${replays.length - replayMismatch.length}/${replays.length}`);
const reuses = retries.filter((r) => r.phase === "reuse");
const reuseOk = reuses.filter((r) => r.status === 409 && r.code === "IDEMPOTENCY_KEY_REUSED");
check("same key + different seats is rejected (409)", reuseOk.length === reuses.length, `${reuseOk.length}/${reuses.length}`);

const inFlightDupes = new Map();
hot.filter((r) => r.status === 201).forEach((r) => inFlightDupes.set(r.idemKey, (inFlightDupes.get(r.idemKey) ?? new Set()).add(r.data.reservation_id)));
check("concurrent duplicates (same key) reserve once", [...inFlightDupes.values()].every((ids) => ids.size === 1));

const limitWins = limitRun.filter((r) => r.status === 201).length;
check(`per-user limit holds (<= ${opts.limit})`, limitWins <= opts.limit, `${limitWins} succeeded, ${limitRun.filter((r) => r.code === "PER_USER_LIMIT").length} declined PER_USER_LIMIT`);

if (opts.confirm) {
  const confirmed = confirms.filter((r) => r.status === 200).length;
  check("every winning hold confirmed", confirmed === allWins.length, `${confirmed}/${allWins.length}`);
}

// ---------------------------------------------------------------- reconciliation

const finalState = await request("GET", `/shows/${showId}`, { token: admin.token });
const c = finalState.data?.counts;
console.log("\n== reconciliation ==");
if (!c) {
  check("final show state readable", false, `${finalState.status}`);
} else {
  const sum = c.available + c.held + c.confirmed;
  const total = finalState.data.total_seats;
  console.log(`   available ${c.available} + held ${c.held} + confirmed ${c.confirmed} = ${sum}  (total_seats ${total})`);
  check("available + held + confirmed == total_seats", sum === total, `${sum} vs ${total}`);

  const grantedSeats = seatOwners.size;
  check("server's held + confirmed == seats the clients won", c.held + c.confirmed === grantedSeats,
    `${c.held + c.confirmed} on server vs ${grantedSeats} won (a hold that lapsed mid-run would also explain a gap)`);
  if (opts.confirm) {
    const confirmedIds = new Set(confirms.filter((r) => r.status === 200).map((r) => r.data.reservation_id));
    const confirmedSeats = allWins.filter((w) => confirmedIds.has(w.data.reservation_id)).reduce((n, w) => n + w.seats.length, 0);
    check("server's confirmed == seats in confirmed reservations", c.confirmed === confirmedSeats, `${c.confirmed} vs ${confirmedSeats}`);
  }
}

// ---------------------------------------------------------------- summary

const total = new Map();
allResults.forEach((r) => total.set(outcomeLabel(r), (total.get(outcomeLabel(r)) ?? 0) + 1));
console.log(`\n== outcome distribution (all phases, ${allResults.length} requests) ==`);
[...total.entries()].sort((a, b) => b[1] - a[1]).forEach(([label, n]) => console.log(`   ${String(n).padStart(7)}  ${label}`));

console.log("\n== checks ==");
checks.forEach((ch) => console.log(`   ${ch.ok ? "PASS" : "FAIL"}  ${ch.name}${ch.detail ? `  (${ch.detail})` : ""}`));
const failed = checks.filter((ch) => !ch.ok).length;
console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`}  show ${showId}`);
process.exit(failed === 0 ? 0 : 1);
