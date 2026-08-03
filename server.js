"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { exec } = require("child_process");
const os = require("os");
const crypto = require("crypto");

loadEnv(path.join(__dirname, ".env"));

const CONFIG = {
  port: intEnv("PORT", 3000, 1, 65_535),
  host: String(process.env.HOST || "0.0.0.0"),
  autoOpen: boolEnv(
    "AUTO_OPEN",
    !(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID)
  ),
  appUsername: String(process.env.APP_USERNAME || "cua").trim() || "cua",
  appPassword: String(process.env.APP_PASSWORD || ""),
  railwayEnvironment: String(process.env.RAILWAY_ENVIRONMENT || ""),
  railwayPublicDomain: String(process.env.RAILWAY_PUBLIC_DOMAIN || ""),
  scanIntervalMs: intEnv("SCAN_INTERVAL_MS", 10_000, 5_000, 300_000),
  fastTickerEnabled: boolEnv("FAST_TICKER_ENABLED", true),
  fastTickerMs: intEnv("FAST_TICKER_MS", 1_000, 750, 10_000),
  fastTickerMaxTokens: intEnv("FAST_TICKER_MAX_TOKENS", 90, 1, 120),
  birdeyeApiKey: String(process.env.BIRDEYE_API_KEY || "").trim(),
  birdeyeWsEnabled: boolEnv("BIRDEYE_WS_ENABLED", true),
  birdeyeWsUrl: String(process.env.BIRDEYE_WS_URL || "wss://public-api.birdeye.so/socket/solana").trim(),
  birdeyeWsMaxTokens: intEnv("BIRDEYE_WS_MAX_TOKENS", 100, 1, 100),
  birdeyeWsResubscribeMs: intEnv("BIRDEYE_WS_RESUBSCRIBE_MS", 2_000, 500, 60_000),
  birdeyeFreshLockMs: intEnv("BIRDEYE_FRESH_LOCK_MS", 15_000, 1_000, 120_000),
  birdeyeReconnectMaxMs: intEnv("BIRDEYE_RECONNECT_MAX_MS", 30_000, 2_000, 300_000),
  birdeyeMcMode: ["fdv", "marketcap"].includes(String(process.env.BIRDEYE_MC_MODE || "").toLowerCase())
    ? String(process.env.BIRDEYE_MC_MODE).toLowerCase()
    : "fdv",
  realtimeBroadcastMs: intEnv("REALTIME_BROADCAST_MS", 150, 50, 1_000),
  timeoutMs: intEnv("REQUEST_TIMEOUT_MS", 9_000, 2_000, 60_000),
  geckoEnabled: boolEnv("GECKO_ENABLED", true),
  geckoPages: intEnv("GECKO_PAGES", 1, 1, 3),
  geckoRefreshMs: intEnv("GECKO_REFRESH_MS", 120_000, 60_000, 3_600_000),
  geckoCooldownMs: intEnv("GECKO_COOLDOWN_MS", 900_000, 60_000, 7_200_000),
  maxCandidates: intEnv("MAX_CANDIDATES", 150, 20, 500),
  mockMode: process.argv.includes("--mock") || boolEnv("MOCK_MODE", false),
  geckoApi: trimSlash(process.env.GECKO_API_URL || "https://api.geckoterminal.com/api/v2"),
  dexApi: trimSlash(process.env.DEXSCREENER_API_URL || "https://api.dexscreener.com"),
  rpcAudit: boolEnv("ENABLE_RPC_AUDIT", false),
  rpcAuditTopN: intEnv("RPC_AUDIT_TOP_N", 12, 1, 40),
  rpcAuditCacheMs: intEnv("RPC_AUDIT_CACHE_MS", 600_000, 60_000, 86_400_000),
  rpcUrls: [...new Set([
    process.env.SOLANA_RPC_URL,
    ...(process.env.SOLANA_RPC_FALLBACK_URLS || "").split(","),
    "https://api.mainnet.solana.com"
  ].map(value => String(value || "").trim()).filter(Boolean).map(trimSlash))],
  jupiterApiKey: (process.env.JUPITER_API_KEY || "").trim(),
  appVersion: "4.0.0-railway",
  realSlippageMode: ["rtse", "fixed"].includes(String(process.env.REAL_SLIPPAGE_MODE || "").toLowerCase())
    ? String(process.env.REAL_SLIPPAGE_MODE).toLowerCase()
    : "rtse",
  realRouteDiagnostic: boolEnv("REAL_ROUTE_DIAGNOSTIC", true),
  realRouteProbeSol: floatEnv("REAL_ROUTE_PROBE_SOL", 0.01, 0.000001, 10),
  realSelfPayFallback: boolEnv("REAL_SELF_PAY_FALLBACK", true),
  realV1MaxPriorityLamports: intEnv("REAL_V1_MAX_PRIORITY_LAMPORTS", 100_000, 0, 10_000_000),
  realTokenAccountSize: intEnv("REAL_TOKEN_ACCOUNT_SIZE", 165, 165, 4096),
  realIncludeWsolUpfrontRent: boolEnv("REAL_INCLUDE_WSOL_UPFRONT_RENT", true),
  realSelfPaySafetyBufferLamports: intEnv("REAL_SELF_PAY_SAFETY_BUFFER_LAMPORTS", 100_000, 0, 20_000_000),
  realSimulationLogLimit: intEnv("REAL_SIMULATION_LOG_LIMIT", 30, 5, 100),
  realGaslessDefaultMinUsd: floatEnv("REAL_GASLESS_DEFAULT_MIN_USD", 5, 0.01, 1_000),
  realWalletPollMs: intEnv("REAL_WALLET_POLL_MS", 2_000, 1_000, 30_000),
  realOrderTtlMs: intEnv("REAL_ORDER_TTL_MS", 90_000, 15_000, 300_000),
  realMinSolReserve: floatEnv("REAL_MIN_SOL_RESERVE", 0.00005, 0, 10),
  jupiterBaseUrl: trimSlash(process.env.JUPITER_BASE_URL || "https://api.jup.ag/swap/v2"),
  jupiterV1BaseUrl: trimSlash(process.env.JUPITER_V1_BASE_URL || "https://api.jup.ag/swap/v1"),
  paperQuoteMode: ["auto", "jupiter", "dex"].includes(String(process.env.PAPER_QUOTE_MODE || "").toLowerCase())
    ? String(process.env.PAPER_QUOTE_MODE).toLowerCase()
    : "auto",
  paperTakerAddress: process.env.PAPER_TAKER_ADDRESS || "BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV",
  paperStartUsd: floatEnv("PAPER_START_USD", 100, 10, 1_000_000),
  paperStartSolPct: floatEnv("PAPER_START_SOL_PCT", 90, 0, 100),
  paperDefaultSlippageBps: intEnv("PAPER_DEFAULT_SLIPPAGE_BPS", 100, 0, 10_000),
  paperFallbackSlippageBps: intEnv("PAPER_FALLBACK_SLIPPAGE_BPS", 100, 1, 10_000),
  paperBaseFeeLamports: intEnv("PAPER_BASE_FEE_LAMPORTS", 5_000, 0, 10_000_000),
  paperPriorityFeeLamports: intEnv("PAPER_PRIORITY_FEE_LAMPORTS", 50_000, 0, 100_000_000),
  paperAtaRentLamports: intEnv("PAPER_ATA_RENT_LAMPORTS", 2_039_280, 0, 20_000_000),
  paperDexFeeBps: intEnv("PAPER_DEX_FEE_BPS", 30, 0, 1_000),
  paperStableFeeBps: intEnv("PAPER_STABLE_FEE_BPS", 2, 0, 1_000),
  paperFallbackLiquidityUsd: floatEnv("PAPER_FALLBACK_LIQUIDITY_USD", 20_000, 100, 1_000_000_000),
  paperFillMode: ["quote", "mid", "worst"].includes(process.env.PAPER_FILL_MODE) ? process.env.PAPER_FILL_MODE : "mid",
  paperHistoryLimit: intEnv("PAPER_HISTORY_LIMIT", 2_000, 20, 10_000),
  persistentDataDir:
    process.env.MEME_TRADER_DATA_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    path.join(os.homedir(), ".solana-memecoin-paper-trader")
};

const PUBLIC_DIR = path.join(__dirname, "public");
const LEGACY_DATA_DIR = path.join(__dirname, "data");
const DATA_ROOT = path.resolve(CONFIG.persistentDataDir);
const PROFILES_DIR = path.join(DATA_ROOT, "profiles");
const REAL_DIR = path.join(DATA_ROOT, "real-wallets");
const PROFILE_INDEX_FILE = path.join(DATA_ROOT, "profiles.json");
const QUICK_TRADE_SETTINGS_FILE = path.join(DATA_ROOT, "quick-trade-settings.json");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const LAMPORTS_PER_SOL = 1_000_000_000;
fs.mkdirSync(PROFILES_DIR, { recursive: true });
fs.mkdirSync(REAL_DIR, { recursive: true });


const DEFAULT_QUICK_TRADE_PRESETS = Object.freeze({
  P1: [0.01, 0.02, 0.06, 1],
  P2: [0.001, 0.01, 0.03, 0.05],
  P3: [0.02, 0.04, 0.08, 0.1]
});

function normalizeQuickPreset(values, fallback) {
  const source = Array.isArray(values) ? values : fallback;
  return [0, 1, 2, 3].map(index => {
    const value = Number(source[index]);
    const safe = Number.isFinite(value) && value > 0 ? value : fallback[index];
    return Math.min(1000, Math.max(0.000001, Math.round(safe * 1e9) / 1e9));
  });
}

function defaultQuickTradeSettings() {
  return {
    version: 1,
    presets: {
      P1: [...DEFAULT_QUICK_TRADE_PRESETS.P1],
      P2: [...DEFAULT_QUICK_TRADE_PRESETS.P2],
      P3: [...DEFAULT_QUICK_TRADE_PRESETS.P3]
    },
    updatedAt: Date.now()
  };
}

function loadQuickTradeSettings() {
  const fallback = defaultQuickTradeSettings();
  try {
    const saved = JSON.parse(fs.readFileSync(QUICK_TRADE_SETTINGS_FILE, "utf8"));
    return {
      version: 1,
      presets: {
        P1: normalizeQuickPreset(saved?.presets?.P1, fallback.presets.P1),
        P2: normalizeQuickPreset(saved?.presets?.P2, fallback.presets.P2),
        P3: normalizeQuickPreset(saved?.presets?.P3, fallback.presets.P3)
      },
      updatedAt: Number(saved?.updatedAt || Date.now())
    };
  } catch {
    return fallback;
  }
}

function saveQuickTradeSettings(input) {
  const fallback = defaultQuickTradeSettings();
  const saved = {
    version: 1,
    presets: {
      P1: normalizeQuickPreset(input?.presets?.P1, fallback.presets.P1),
      P2: normalizeQuickPreset(input?.presets?.P2, fallback.presets.P2),
      P3: normalizeQuickPreset(input?.presets?.P3, fallback.presets.P3)
    },
    updatedAt: Date.now()
  };
  const temp = `${QUICK_TRADE_SETTINGS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(saved, null, 2));
  fs.renameSync(temp, QUICK_TRADE_SETTINGS_FILE);
  return saved;
}

function profileAccountFile(profileId) { return path.join(PROFILES_DIR, `${profileId}.account.json`); }
function profileWatchlistFile(profileId) { return path.join(PROFILES_DIR, `${profileId}.watchlist.json`); }
function profileHiddenMemesFile(profileId) { return path.join(PROFILES_DIR, `${profileId}.hidden-memes.json`); }
function profileSafeName(name) { return String(name || "Profile").trim().replace(/[\x00-\x1f<>:\"/\\|?*]/g, "").slice(0, 40) || "Profile"; }
function profileCode() {
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `MEME-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
}
function profileId() { return `p_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`; }
function saveProfileStore(store) {
  store.updatedAt = Date.now();
  const temp = `${PROFILE_INDEX_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, PROFILE_INDEX_FILE);
}
function findLegacyFiles() {
  const candidates = [];
  const add = dir => {
    try {
      const account = path.join(dir, "data", "paper-account.json");
      const watch = path.join(dir, "data", "watchlist.json");
      if (fs.existsSync(account)) candidates.push({ account, watch, mtime: fs.statSync(account).mtimeMs });
    } catch {}
  };
  add(__dirname);
  try {
    const parent = path.dirname(__dirname);
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && /solana-memecoin-paper-trader/i.test(entry.name)) add(path.join(parent, entry.name));
    }
  } catch {}
  return candidates.sort((a,b) => b.mtime - a.mtime)[0] || null;
}
function loadProfileStore() {
  try {
    const store = JSON.parse(fs.readFileSync(PROFILE_INDEX_FILE, "utf8"));
    if (store?.profiles?.length) return store;
  } catch {}
  const id = profileId();
  const profile = { id, name: "Profile chính", code: profileCode(), createdAt: Date.now(), updatedAt: Date.now() };
  const store = { version: 1, activeProfileId: id, profiles: [profile], createdAt: Date.now(), updatedAt: Date.now() };
  const legacy = findLegacyFiles();
  if (legacy) {
    try { fs.copyFileSync(legacy.account, profileAccountFile(id)); } catch {}
    try { if (fs.existsSync(legacy.watch)) fs.copyFileSync(legacy.watch, profileWatchlistFile(id)); } catch {}
  }
  saveProfileStore(store);
  return store;
}
let profileStore = loadProfileStore();
function activeProfile() {
  let profile = profileStore.profiles.find(p => p.id === profileStore.activeProfileId);
  if (!profile) {
    profile = profileStore.profiles[0];
    profileStore.activeProfileId = profile.id;
    saveProfileStore(profileStore);
  }
  return profile;
}
function getPaperFile() { return profileAccountFile(activeProfile().id); }
function getWatchlistFile() { return profileWatchlistFile(activeProfile().id); }
function getHiddenMemesFile() { return profileHiddenMemesFile(activeProfile().id); }
function publicProfiles() {
  return {
    activeProfileId: activeProfile().id,
    dataRoot: DATA_ROOT,
    profiles: profileStore.profiles.map(p => ({ ...p, active: p.id === activeProfile().id }))
  };
}
function setActiveProfile(idOrCode) {
  const key = String(idOrCode || "").trim().toUpperCase();
  const found = profileStore.profiles.find(p => p.id === idOrCode || String(p.code).toUpperCase() === key);
  if (!found) throw new Error("Không tìm thấy profile hoặc mã khôi phục");
  profileStore.activeProfileId = found.id;
  found.updatedAt = Date.now();
  saveProfileStore(profileStore);
  return found;
}
function createProfileRecord(name) {
  const profile = { id: profileId(), name: profileSafeName(name), code: profileCode(), createdAt: Date.now(), updatedAt: Date.now() };
  profileStore.profiles.push(profile);
  profileStore.activeProfileId = profile.id;
  saveProfileStore(profileStore);
  return profile;
}

let state = {
  scanning: false,
  source: "Đang khởi động",
  mode: CONFIG.mockMode ? "mock" : "live",
  status: "loading",
  message: "Đang kết nối nguồn dữ liệu…",
  updatedAt: null,
  nextScanAt: null,
  durationMs: 0,
  tokens: [],
  stats: {},
  errors: []
};

const clients = new Set();
const auditCache = new Map();
let activeRpcUrl = CONFIG.rpcUrls[0];
let lastRpcFailures = [];
let rpcRequestSequence = 0;

function nextRpcRequestId() {
  // Solana JSON-RPC examples use an integer ID. Do not use Date.now() + Math.random(),
  // because that creates a fractional number and some RPC parsers reject it with -32700.
  rpcRequestSequence = (rpcRequestSequence % 2_147_483_646) + 1;
  return rpcRequestSequence;
}
let scanTimer = null;
let mockTick = 0;
let geckoCache = { tokens: [], fetchedAt: 0 };
let geckoBlockedUntil = 0;
let fastTickerTimer = null;
let fastTickerRunning = false;
let fastTickerUpdatedAt = 0;
let fastTickerError = null;
const realTrackedMints = new Set();
const realtimeTokenMeta = new Map();
const pendingMarketDeltas = new Map();
let realtimeDeltaTimer = null;
let birdeyeSocket = null;
let birdeyeReconnectTimer = null;
let birdeyeResubscribeTimer = null;
let birdeyeReconnectAttempt = 0;
let birdeyeSubscriptionKey = "";
let birdeyeStatus = {
  configured: Boolean(CONFIG.birdeyeApiKey && CONFIG.birdeyeWsEnabled),
  connected: false,
  status: CONFIG.birdeyeApiKey ? "disconnected" : "missing_key",
  subscribedTokens: 0,
  lastMessageAt: 0,
  lastError: null,
  reconnects: 0
};
const tokenDecimalsCache = new Map([[SOL_MINT, 9], [USDC_MINT, 6]]);
let solPriceCache = { value: 0, fetchedAt: 0 };
let paperLock = Promise.resolve();
const realOrderCache = new Map();
const realWalletLocks = new Map();
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function intEnv(name, fallback, min, max) {
  const n = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function floatEnv(name, fallback, min, max) {
  const n = Number.parseFloat(process.env[name] || "");
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, "");
}


function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
}

function safeSecretEquals(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""), "utf8");
  const expectedBuffer = Buffer.from(String(expected || ""), "utf8");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function isRequestAuthorized(req) {
  if (!CONFIG.appPassword) return true;
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return safeSecretEquals(username, CONFIG.appUsername)
      && safeSecretEquals(password, CONFIG.appPassword);
  } catch {
    return false;
  }
}

function requestBasicAuth(res) {
  const body = "Cần đăng nhập để sử dụng MemeCoin Trader.";
  res.writeHead(401, {
    ...securityHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "WWW-Authenticate": 'Basic realm="MemeCoin Trader", charset="UTF-8"'
  });
  res.end(body);
}

function dataDirectoryWritable() {
  try {
    fs.accessSync(DATA_ROOT, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function readBody(req, max = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > max) {
        reject(new Error("Dữ liệu gửi lên quá lớn"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("JSON không hợp lệ"));
      }
    });
    req.on("error", reject);
  });
}

function fetchJson(url, options = {}, redirects = 3) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const request = lib.request(parsed, {
      method: options.method || "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Solana-Memecoin-Scanner/1.0",
        ...(options.headers || {})
      },
      timeout: options.timeoutMs || CONFIG.timeoutMs
    }, response => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location && redirects > 0) {
        response.resume();
        return resolve(fetchJson(new URL(response.headers.location, url).toString(), options, redirects - 1));
      }

      let raw = "";
      response.setEncoding("utf8");
      response.on("data", chunk => raw += chunk);
      response.on("end", () => {
        const status = Number(response.statusCode || 0);
        const contentType = String(response.headers["content-type"] || "");
        let parsedBody = null;
        if (raw.trim()) {
          try { parsedBody = JSON.parse(raw); } catch {}
        }

        if (status < 200 || status >= 300) {
          const apiMessage = parsedBody?.errorMessage || parsedBody?.error || parsedBody?.message;
          const bodyPreview = apiMessage || raw.replace(/\s+/g, " ").trim().slice(0, 260) || "Không có nội dung phản hồi";
          const error = new Error(`HTTP ${status}: ${bodyPreview}`);
          error.statusCode = status;
          error.retryAfter = Number(response.headers["retry-after"] || 0);
          error.rateLimitReset = Number(response.headers["x-ratelimit-reset"] || 0);
          error.responseBody = parsedBody || raw;
          return reject(error);
        }

        if (parsedBody !== null) return resolve(parsedBody);
        reject(new Error(`API trả về dữ liệu không phải JSON (${contentType || "không rõ content-type"}): ${raw.replace(/\s+/g, " ").trim().slice(0, 220)}`));
      });
    });

    request.on("timeout", () => request.destroy(new Error("Hết thời gian chờ kết nối")));
    request.on("error", error => {
      const detail = error.cause?.code || error.code || error.message;
      reject(new Error(`Kết nối thất bại (${detail})`));
    });

    if (options.body != null) {
      const body = Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(String(options.body), "utf8");
      request.write(body);
    }
    request.end();
  });
}

function rpcEndpointLabel(endpoint) {
  try {
    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return String(endpoint || "unknown").replace(/([?&](?:api-key|apikey|key)=)[^&]+/gi, "$1***");
  }
}

async function rpcAt(endpoint, method, params) {
  const requestId = nextRpcRequestId();
  const requestObject = {
    jsonrpc: "2.0",
    id: requestId,
    method: String(method),
    params: Array.isArray(params) ? params : []
  };
  const payload = JSON.stringify(requestObject);
  const payloadBuffer = Buffer.from(payload, "utf8");

  const result = await fetchJson(endpoint, {
    method: "POST",
    body: payloadBuffer,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "application/json",
      "Content-Length": String(payloadBuffer.byteLength)
    }
  });

  if (result?.error) {
    const error = new Error(result.error.message || "Solana RPC lỗi");
    error.rpcCode = result.error.code;
    error.rpcData = result.error.data ?? null;
    error.rpcEndpoint = endpoint;
    error.rpcMethod = method;
    error.rpcRequestId = requestId;
    error.rpcRequestBytes = payloadBuffer.byteLength;
    throw error;
  }

  if (!result || result.jsonrpc !== "2.0") {
    const error = new Error("Solana RPC trả response không đúng JSON-RPC 2.0");
    error.rpcCode = "INVALID_RESPONSE";
    error.rpcMethod = method;
    error.rpcRequestId = requestId;
    throw error;
  }

  if (result.id !== requestId && String(result.id) !== String(requestId)) {
    const error = new Error(`Solana RPC trả sai request id: nhận ${result.id}, chờ ${requestId}`);
    error.rpcCode = "ID_MISMATCH";
    error.rpcMethod = method;
    error.rpcRequestId = requestId;
    throw error;
  }

  return result.result;
}


function isDeterministicTransactionRpcError(error, method) {
  const code = Number(error?.rpcCode);
  const message = String(error?.message || "").toLowerCase();
  const transactionMethod = ["sendTransaction", "simulateTransaction"].includes(String(method));
  return transactionMethod && (
    (code === -32002 && message.includes("transaction simulation failed")) ||
    message.includes("signature verification failure") ||
    message.includes("blockhash not found") ||
    message.includes("insufficient funds")
  );
}

async function rpc(method, params) {
  const candidates = [activeRpcUrl, ...CONFIG.rpcUrls].filter((value, index, array) => value && array.indexOf(value) === index);
  const failures = [];

  for (const endpoint of candidates) {
    try {
      const result = await rpcAt(endpoint, method, params);
      activeRpcUrl = endpoint;
      lastRpcFailures = failures;
      return result;
    } catch (error) {
      const detail = error.cause?.code || error.code || error.statusCode || error.rpcCode || "ERROR";
      const failure = {
        endpoint: rpcEndpointLabel(endpoint),
        code: String(detail),
        message: String(error.message || error).slice(0, 220),
        method: error.rpcMethod || method,
        requestId: error.rpcRequestId ?? null,
        requestIdType: error.rpcRequestId == null ? null : typeof error.rpcRequestId,
        requestBytes: error.rpcRequestBytes ?? null
      };
      failures.push(failure);

      // A simulation failure is caused by the transaction/account state, not by
      // the RPC provider. Running the exact same signed transaction on a second
      // RPC only produces the same error and a misleading "cannot connect" message.
      if (isDeterministicTransactionRpcError(error, method)) {
        activeRpcUrl = endpoint;
        lastRpcFailures = failures;
        error.rpcFailures = failures;
        throw error;
      }
    }
  }

  lastRpcFailures = failures;
  const summary = failures.map(item => `${item.endpoint} [${item.code}] ${item.message}`).join(" | ");
  const error = new Error(`Không kết nối được Solana RPC. ${summary || "Không có endpoint RPC"}`);
  error.rpcFailures = failures;
  throw error;
}

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoToMs(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : Date.now();
}

function relationshipId(item, key) {
  return item?.relationships?.[key]?.data?.id || null;
}

function includedMap(payload) {
  const map = new Map();
  for (const item of payload?.included || []) {
    map.set(item.id, item);
  }
  return map;
}

function parseTokenResource(resource) {
  const a = resource?.attributes || {};
  return {
    address: a.address || resource?.id?.split("_").slice(1).join("_") || "",
    name: a.name || "",
    symbol: a.symbol || "",
    imageUrl: a.image_url || a.imageUrl || null,
    websites: a.websites || [],
    discordUrl: a.discord_url || null,
    telegramHandle: a.telegram_handle || null,
    twitterHandle: a.twitter_handle || null
  };
}

function parseGeckoPool(item, included, now = Date.now()) {
  const a = item.attributes || {};
  const baseRes = included.get(relationshipId(item, "base_token"));
  const quoteRes = included.get(relationshipId(item, "quote_token"));
  const dexRes = included.get(relationshipId(item, "dex"));
  const base = parseTokenResource(baseRes);
  const quote = parseTokenResource(quoteRes);
  const tx = a.transactions || {};
  const vol = a.volume_usd || {};
  const change = a.price_change_percentage || {};
  const createdAt = isoToMs(a.pool_created_at);
  const ageMinutes = Math.max(0, (now - createdAt) / 60_000);
  const reserveUsd = n(a.reserve_in_usd);
  const fdv = n(a.fdv_usd || a.market_cap_usd);
  const marketCap = n(a.market_cap_usd || a.fdv_usd);
  const buys5m = n(tx.m5?.buys);
  const sells5m = n(tx.m5?.sells);
  const buys1h = n(tx.h1?.buys);
  const sells1h = n(tx.h1?.sells);
  const pairAddress = a.address || item.id?.split("_").slice(1).join("_") || "";

  return normalizeToken({
    id: base.address || pairAddress,
    chainId: "solana",
    source: "GeckoTerminal",
    marketSource: "Gecko REST",
    marketSourceAt: now,
    marketReceivedAt: now,
    pairAddress,
    tokenAddress: base.address,
    name: base.name || a.name?.split(" / ")[0] || "Token mới",
    symbol: base.symbol || a.name?.split(" / ")[0] || "???",
    imageUrl: base.imageUrl,
    quoteSymbol: quote.symbol || "SOL",
    dexId: dexRes?.attributes?.name || dexRes?.id?.split("_").slice(1).join("_") || "DEX",
    createdAt,
    ageMinutes,
    priceUsd: n(a.base_token_price_usd),
    liquidityUsd: reserveUsd,
    marketCap,
    fdv,
    volume5m: n(vol.m5),
    volume1h: n(vol.h1),
    volume24h: n(vol.h24),
    priceChange5m: n(change.m5),
    priceChange1h: n(change.h1),
    priceChange24h: n(change.h24),
    buys5m,
    sells5m,
    buys1h,
    sells1h,
    txns5m: buys5m + sells5m,
    txns1h: buys1h + sells1h,
    socials: {
      websites: base.websites,
      discord: base.discordUrl,
      telegram: base.telegramHandle,
      twitter: base.twitterHandle
    },
    profileUrl: null,
    boosts: 0,
    rawSource: "new_pools"
  });
}

function parseDexPair(pair, profile = {}) {
  const receivedAt = Date.now();
  const base = pair.baseToken || {};
  const tx = pair.txns || {};
  const vol = pair.volume || {};
  const change = pair.priceChange || {};
  const createdAt = n(pair.pairCreatedAt, Date.now());
  const buys5m = n(tx.m5?.buys);
  const sells5m = n(tx.m5?.sells);
  const buys1h = n(tx.h1?.buys);
  const sells1h = n(tx.h1?.sells);

  return normalizeToken({
    id: base.address || pair.pairAddress,
    chainId: pair.chainId || "solana",
    source: "DEX Screener",
    marketSource: "DEX REST",
    marketSourceAt: receivedAt,
    marketReceivedAt: receivedAt,
    pairAddress: pair.pairAddress,
    tokenAddress: base.address,
    name: base.name || profile.description || "Token mới",
    symbol: base.symbol || "???",
    imageUrl: pair.info?.imageUrl || profile.icon || null,
    quoteSymbol: pair.quoteToken?.symbol || "SOL",
    dexId: pair.dexId || "DEX",
    createdAt,
    ageMinutes: Math.max(0, (Date.now() - createdAt) / 60_000),
    priceUsd: n(pair.priceUsd),
    liquidityUsd: n(pair.liquidity?.usd),
    marketCap: n(pair.marketCap || pair.fdv),
    fdv: n(pair.fdv || pair.marketCap),
    volume5m: n(vol.m5),
    volume1h: n(vol.h1),
    volume24h: n(vol.h24),
    priceChange5m: n(change.m5),
    priceChange1h: n(change.h1),
    priceChange24h: n(change.h24),
    buys5m,
    sells5m,
    buys1h,
    sells1h,
    txns5m: buys5m + sells5m,
    txns1h: buys1h + sells1h,
    socials: {
      websites: pair.info?.websites || [],
      socialLinks: pair.info?.socials || [],
      links: profile.links || []
    },
    profileUrl: profile.url || pair.url || null,
    boosts: n(profile.amount || profile.totalAmount),
    rawSource: profile.rawSource || "profiles"
  });
}

const BLUECHIPS = new Set([
  "SOL", "WSOL", "USDC", "USDT", "JUP", "JTO", "RAY", "BONK", "WIF",
  "PYTH", "ORCA", "KMNO", "MSOL", "JITOSOL", "BSOL", "USDS"
]);

const MEME_WORDS = [
  "meme", "dog", "doge", "inu", "shib", "cat", "kitty", "frog", "pepe",
  "wojak", "baby", "elon", "trump", "moon", "pump", "ape", "monkey", "bear",
  "bull", "chad", "degen", "based", "ai", "grok", "goat", "pengu", "duck",
  "rat", "hamster", "rabbit", "bunny", "cua", "crab", "fish", "coin"
];

function normalizeToken(token) {
  const symbol = String(token.symbol || "???").trim().slice(0, 18);
  const name = String(token.name || symbol).trim().slice(0, 80);
  const marketCap = n(token.marketCap || token.fdv);
  const liquidityUsd = n(token.liquidityUsd);
  const buys5m = n(token.buys5m);
  const sells5m = n(token.sells5m);
  const buySellRatio = sells5m > 0 ? buys5m / sells5m : buys5m > 0 ? 9.99 : 0;
  const liquidityRatio = marketCap > 0 ? liquidityUsd / marketCap : 0;
  const volumeLiquidity5m = liquidityUsd > 0 ? n(token.volume5m) / liquidityUsd : 0;

  const normalized = {
    ...token,
    id: token.tokenAddress || token.pairAddress,
    symbol,
    name,
    marketCap,
    fdv: n(token.fdv || marketCap),
    liquidityUsd,
    buys5m,
    sells5m,
    txns5m: n(token.txns5m, buys5m + sells5m),
    buySellRatio,
    liquidityRatio,
    volumeLiquidity5m,
    riskFlags: [],
    audit: token.audit || null
  };

  normalized.memeScore = memeScore(normalized);
  const scored = scoreToken(normalized);
  normalized.score = scored.score;
  normalized.grade = scored.grade;
  normalized.signal = scored.signal;
  normalized.riskFlags = scored.riskFlags;
  return normalized;
}

function memeScore(token) {
  const text = `${token.name} ${token.symbol} ${token.dexId}`.toLowerCase();
  let score = 5;
  if (String(token.tokenAddress || "").toLowerCase().endsWith("pump")) score += 45;
  if (/pump|moonshot|meteora|raydium/.test(String(token.dexId).toLowerCase())) score += 15;
  if (MEME_WORDS.some(word => text.includes(word))) score += 25;
  if (token.ageMinutes <= 24 * 60) score += 10;
  if (hasSocial(token)) score += 10;
  if (token.boosts > 0) score += 10;
  if (BLUECHIPS.has(token.symbol.toUpperCase())) score = 0;
  return Math.max(0, Math.min(100, score));
}

function hasSocial(token) {
  const s = token.socials || {};
  return Boolean(
    (Array.isArray(s.websites) && s.websites.length) ||
    (Array.isArray(s.socialLinks) && s.socialLinks.length) ||
    (Array.isArray(s.links) && s.links.length) ||
    s.twitter || s.telegram || s.discord
  );
}

function scoreToken(token) {
  let score = 0;
  const riskFlags = [];

  // Thanh khoản: tối đa 20
  if (token.liquidityUsd >= 100_000) score += 20;
  else if (token.liquidityUsd >= 50_000) score += 17;
  else if (token.liquidityUsd >= 20_000) score += 13;
  else if (token.liquidityUsd >= 10_000) score += 8;
  else {
    score += 2;
    riskFlags.push("Thanh khoản thấp");
  }

  // Volume 5 phút so với thanh khoản: tối đa 18
  const vl = token.volumeLiquidity5m;
  if (vl >= 0.12 && vl <= 0.8) score += 18;
  else if (vl >= 0.05 && vl <= 1.2) score += 13;
  else if (vl >= 0.02) score += 8;
  else score += 2;
  if (vl > 2.5) riskFlags.push("Volume bất thường");

  // Giao dịch: tối đa 14
  if (token.txns5m >= 100) score += 14;
  else if (token.txns5m >= 50) score += 11;
  else if (token.txns5m >= 20) score += 8;
  else if (token.txns5m >= 8) score += 4;
  else riskFlags.push("Ít giao dịch");

  // Áp lực mua: tối đa 12
  if (token.buySellRatio >= 1.25 && token.buySellRatio <= 3.5) score += 12;
  else if (token.buySellRatio >= 1.0 && token.buySellRatio <= 5) score += 8;
  else if (token.buySellRatio > 5) {
    score += 3;
    riskFlags.push("Mua lệch quá mạnh");
  } else {
    score += 2;
    riskFlags.push("Lực bán lớn");
  }

  // Momentum 5m: tối đa 12
  if (token.priceChange5m >= 2 && token.priceChange5m <= 22) score += 12;
  else if (token.priceChange5m > -5 && token.priceChange5m < 35) score += 8;
  else if (token.priceChange5m >= -12 && token.priceChange5m <= 50) score += 4;
  else if (token.priceChange5m > 50) {
    riskFlags.push("Nến tăng quá nóng");
  } else {
    riskFlags.push("Đang giảm mạnh");
  }

  // Tuổi pool: tối đa 10
  if (token.ageMinutes >= 8 && token.ageMinutes <= 120) score += 10;
  else if (token.ageMinutes >= 2 && token.ageMinutes <= 360) score += 7;
  else if (token.ageMinutes < 2) {
    score += 2;
    riskFlags.push("Pool quá mới");
  } else score += 4;

  // Tỷ lệ liquidity / MC: tối đa 9
  if (token.liquidityRatio >= 0.12) score += 9;
  else if (token.liquidityRatio >= 0.06) score += 6;
  else if (token.liquidityRatio >= 0.025) score += 3;
  else if (token.marketCap > 0) riskFlags.push("Liquidity/MC thấp");

  // Social/meme: tối đa 5
  if (hasSocial(token)) score += 3;
  if (token.memeScore >= 40) score += 2;
  else riskFlags.push("Chưa rõ là memecoin");

  if (!token.marketCap) riskFlags.push("Thiếu market cap");
  if (!token.tokenAddress) riskFlags.push("Thiếu địa chỉ token");

  if (token.audit) {
    if (token.audit.mintAuthority) {
      score -= 18;
      riskFlags.push("Mint authority còn bật");
    } else if (token.audit.mintAuthority === null) {
      score += 3;
    }

    if (token.audit.freezeAuthority) {
      score -= 15;
      riskFlags.push("Freeze authority còn bật");
    } else if (token.audit.freezeAuthority === null) {
      score += 3;
    }

    if (Number.isFinite(token.audit.top10Pct)) {
      if (token.audit.top10Pct > 70) {
        score -= 15;
        riskFlags.push(`Top 10 giữ ${token.audit.top10Pct.toFixed(0)}%`);
      } else if (token.audit.top10Pct > 50) {
        score -= 8;
        riskFlags.push(`Top 10 giữ ${token.audit.top10Pct.toFixed(0)}%`);
      } else score += 4;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let grade = "C";
  let signal = "Rủi ro cao";
  if (score >= 82) { grade = "A+"; signal = "Rất mạnh"; }
  else if (score >= 72) { grade = "A"; signal = "Đáng xem"; }
  else if (score >= 60) { grade = "B"; signal = "Theo dõi"; }

  return { score, grade, signal, riskFlags: [...new Set(riskFlags)].slice(0, 5) };
}

async function getGeckoNewPools() {
  const now = Date.now();

  if (!CONFIG.geckoEnabled) {
    return { tokens: [], errors: [], mode: "disabled" };
  }

  if (geckoBlockedUntil > now) {
    return {
      tokens: geckoCache.tokens,
      errors: [],
      mode: geckoCache.tokens.length ? "cached-cooldown" : "cooldown",
      blockedUntil: geckoBlockedUntil
    };
  }

  if (geckoCache.tokens.length && now - geckoCache.fetchedAt < CONFIG.geckoRefreshMs) {
    return { tokens: geckoCache.tokens, errors: [], mode: "cached" };
  }

  const tokens = [];
  const errors = [];

  for (let page = 1; page <= CONFIG.geckoPages; page++) {
    const url = `${CONFIG.geckoApi}/networks/solana/new_pools?page=${page}&include=base_token,quote_token,dex`;
    try {
      const payload = await fetchJson(url);
      const included = includedMap(payload);
      for (const item of payload?.data || []) {
        try {
          const token = parseGeckoPool(item, included);
          if (token.tokenAddress) tokens.push(token);
        } catch (error) {
          errors.push(`Không đọc được pool: ${error.message}`);
        }
      }
      // Không bắn nhiều request đồng thời lên API miễn phí.
      if (page < CONFIG.geckoPages) await sleep(850);
    } catch (error) {
      if (error.statusCode === 429) {
        const retryMs = error.retryAfter > 0
          ? error.retryAfter * 1000
          : CONFIG.geckoCooldownMs;
        geckoBlockedUntil = Date.now() + Math.max(retryMs, CONFIG.geckoCooldownMs);
        return {
          tokens: geckoCache.tokens,
          errors: [],
          mode: geckoCache.tokens.length ? "cached-cooldown" : "cooldown",
          blockedUntil: geckoBlockedUntil
        };
      }
      errors.push(error.message);
      break;
    }
  }

  if (tokens.length) {
    geckoCache = { tokens, fetchedAt: Date.now() };
    return { tokens, errors, mode: "live" };
  }

  if (geckoCache.tokens.length) {
    return { tokens: geckoCache.tokens, errors, mode: "cached-error" };
  }

  throw new Error(errors[0] || "GeckoTerminal không trả về pool mới");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDexDiscovery() {
  const endpoints = [
    [`${CONFIG.dexApi}/token-profiles/latest/v1`, "profiles"],
    [`${CONFIG.dexApi}/token-boosts/latest/v1`, "boosts"]
  ];
  const settled = await Promise.allSettled(endpoints.map(([url]) => fetchJson(url)));
  const profileByAddress = new Map();
  const errors = [];

  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      errors.push(result.reason.message);
      return;
    }
    const kind = endpoints[index][1];
    for (const profile of Array.isArray(result.value) ? result.value : []) {
      if (profile.chainId !== "solana" || !profile.tokenAddress) continue;
      const old = profileByAddress.get(profile.tokenAddress) || {};
      profileByAddress.set(profile.tokenAddress, {
        ...old,
        ...profile,
        amount: Math.max(n(old.amount), n(profile.amount)),
        totalAmount: Math.max(n(old.totalAmount), n(profile.totalAmount)),
        rawSource: kind
      });
    }
  });

  const addresses = [...profileByAddress.keys()].slice(0, 90);
  if (!addresses.length) throw new Error(errors[0] || "DEX Screener không có token discovery");

  const chunks = [];
  for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));
  const responses = await Promise.allSettled(
    chunks.map(chunk => fetchJson(`${CONFIG.dexApi}/tokens/v1/solana/${chunk.join(",")}`))
  );

  const bestPairByToken = new Map();
  for (const response of responses) {
    if (response.status === "rejected") {
      errors.push(response.reason.message);
      continue;
    }
    const pairs = Array.isArray(response.value) ? response.value : response.value?.pairs || [];
    for (const pair of pairs) {
      const address = pair.baseToken?.address;
      if (!address || !profileByAddress.has(address)) continue;
      const old = bestPairByToken.get(address);
      if (!old || n(pair.liquidity?.usd) > n(old.liquidity?.usd)) {
        bestPairByToken.set(address, pair);
      }
    }
  }

  const tokens = [];
  for (const [address, pair] of bestPairByToken) {
    tokens.push(parseDexPair(pair, profileByAddress.get(address)));
  }
  if (!tokens.length) throw new Error(errors[0] || "DEX Screener không trả về pair");
  return { tokens, errors };
}

function dedupeTokens(tokens) {
  const byToken = new Map();
  for (const token of tokens) {
    if (!token.tokenAddress) continue;
    const old = byToken.get(token.tokenAddress);
    if (!old || token.liquidityUsd > old.liquidityUsd) {
      byToken.set(token.tokenAddress, token);
    }
  }
  return [...byToken.values()];
}

async function auditToken(token) {
  const cached = auditCache.get(token.tokenAddress);
  if (cached && Date.now() - cached.time < CONFIG.rpcAuditCacheMs) return cached.value;

  const audit = {
    mintAuthority: undefined,
    freezeAuthority: undefined,
    top10Pct: undefined,
    checkedAt: Date.now(),
    error: null
  };

  try {
    const account = await rpc("getAccountInfo", [
      token.tokenAddress,
      { encoding: "jsonParsed", commitment: "confirmed" }
    ]);
    const info = account?.value?.data?.parsed?.info;
    if (info) {
      audit.mintAuthority = info.mintAuthority ?? null;
      audit.freezeAuthority = info.freezeAuthority ?? null;
    }

    const [largest, supply] = await Promise.all([
      rpc("getTokenLargestAccounts", [token.tokenAddress, { commitment: "confirmed" }]),
      rpc("getTokenSupply", [token.tokenAddress, { commitment: "confirmed" }])
    ]);
    const total = n(supply?.value?.uiAmountString || supply?.value?.uiAmount);
    const top10 = (largest?.value || []).slice(0, 10).reduce((sum, item) => {
      return sum + n(item.uiAmountString || item.uiAmount);
    }, 0);
    if (total > 0) audit.top10Pct = (top10 / total) * 100;
  } catch (error) {
    audit.error = error.message;
  }

  auditCache.set(token.tokenAddress, { time: Date.now(), value: audit });
  return audit;
}

async function applyRpcAudits(tokens) {
  if (!CONFIG.rpcAudit) return tokens;
  const candidates = [...tokens]
    .filter(t => t.tokenAddress && t.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.rpcAuditTopN);

  for (let i = 0; i < candidates.length; i += 3) {
    const batch = candidates.slice(i, i + 3);
    await Promise.all(batch.map(async token => {
      token.audit = await auditToken(token);
      const rescored = normalizeToken(token);
      Object.assign(token, rescored);
    }));
  }
  return tokens;
}

function computeStats(tokens) {
  return {
    total: tokens.length,
    strong: tokens.filter(t => t.score >= 72).length,
    watch: tokens.filter(t => t.score >= 60).length,
    memeLikely: tokens.filter(t => t.memeScore >= 30).length,
    audited: tokens.filter(t => t.audit && !t.audit.error).length,
    avgLiquidity: tokens.length ? tokens.reduce((s, t) => s + t.liquidityUsd, 0) / tokens.length : 0,
    totalVolume5m: tokens.reduce((s, t) => s + t.volume5m, 0)
  };
}

async function performScan(manual = false) {
  if (state.scanning) return state;
  state.scanning = true;
  state.status = "loading";
  state.message = manual ? "Đang quét thủ công…" : "Đang quét pool mới…";
  broadcast();

  const started = Date.now();
  const errors = [];
  let tokens = [];
  const sources = [];

  try {
    if (CONFIG.mockMode) {
      mockTick++;
      tokens = mockTokens(mockTick);
      sources.push("Dữ liệu mô phỏng");
    } else {
      const results = await Promise.allSettled([getGeckoNewPools(), getDexDiscovery()]);
      const geckoResult = results[0];
      const dexResult = results[1];

      if (geckoResult.status === "fulfilled") {
        const gecko = geckoResult.value;
        tokens.push(...gecko.tokens);
        errors.push(...gecko.errors);
        if (gecko.mode === "live") sources.push("Gecko New Pools");
        else if (gecko.mode === "cached") sources.push("Gecko cache");
        else if (gecko.mode === "cached-cooldown") sources.push("Gecko cache (đang nghỉ 429)");
        else if (gecko.mode === "cooldown") sources.push("Gecko đang nghỉ 429");
      } else {
        errors.push(`GeckoTerminal: ${geckoResult.reason.message}`);
      }

      if (dexResult.status === "fulfilled") {
        tokens.push(...dexResult.value.tokens);
        errors.push(...dexResult.value.errors);
        sources.push("DEX Screener live");
      } else {
        errors.push(`DEX Screener: ${dexResult.reason.message}`);
      }

      if (!tokens.length) {
        throw new Error("Không nguồn dữ liệu nào phản hồi. Kiểm tra mạng/DNS hoặc bật MOCK_MODE=true.");
      }
    }

    tokens = dedupeTokens(tokens)
      .filter(t => !BLUECHIPS.has(t.symbol.toUpperCase()))
      .sort((a, b) => b.score - a.score)
      .slice(0, CONFIG.maxCandidates);

    tokens = await applyRpcAudits(tokens);
    tokens.sort((a, b) => b.score - a.score || b.volume5m - a.volume5m);

    const now = Date.now();
    state = {
      ...state,
      scanning: false,
      source: sources.join(" + "),
      status: "ok",
      mode: CONFIG.mockMode ? "mock" : "live",
      message: `Đã quét ${tokens.length} token`,
      updatedAt: now,
      nextScanAt: now + CONFIG.scanIntervalMs,
      durationMs: now - started,
      tokens,
      stats: computeStats(tokens),
      errors: [...new Set(errors)].slice(0, 6)
    };
  } catch (error) {
    const now = Date.now();
    state = {
      ...state,
      scanning: false,
      status: "error",
      message: error.message,
      updatedAt: now,
      nextScanAt: now + CONFIG.scanIntervalMs,
      durationMs: now - started,
      errors: [...new Set([...errors, error.message])].slice(0, 8)
    };
  }

  scheduleBirdeyeResubscribe();
  broadcast();
  scheduleNext();
  return state;
}

function scheduleNext() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => performScan(false), CONFIG.scanIntervalMs);
}


function chooseBestPairForToken(pairs, address) {
  return (pairs || [])
    .filter(pair => pair?.chainId === "solana" && pair?.baseToken?.address === address)
    .sort((a, b) => n(b?.liquidity?.usd) - n(a?.liquidity?.usd))[0] || null;
}

const MARKET_VALUE_FIELDS = [
  "priceUsd", "marketCap", "fdv", "liquidityUsd",
  "priceChange5m", "priceChange1h", "priceChange24h",
  "volume5m", "volume1h", "volume24h",
  "buys5m", "sells5m", "buys1h", "sells1h",
  "txns5m", "txns1h", "marketSource", "marketSourceAt",
  "marketReceivedAt", "lastTradeAt", "liveUpdatedAt"
];

function hasFreshBirdeyeLock(token, now = Date.now()) {
  return token?.marketSource === "Birdeye WS"
    && now - n(token?.marketReceivedAt) <= CONFIG.birdeyeFreshLockMs;
}

function mergeFastToken(oldToken, freshToken) {
  const now = Date.now();
  const incomingSource = String(freshToken?.marketSource || freshToken?.source || "");
  const incomingSourceAt = n(freshToken?.marketSourceAt, n(freshToken?.liveUpdatedAt, now));
  const currentSourceAt = n(oldToken?.marketSourceAt);
  const incomingIsBirdeye = incomingSource === "Birdeye WS";
  const currentIsBirdeye = oldToken?.marketSource === "Birdeye WS";

  if (incomingIsBirdeye && currentIsBirdeye && incomingSourceAt < currentSourceAt) {
    return oldToken;
  }

  const mergedInput = {
    ...oldToken,
    ...freshToken,
    audit: oldToken?.audit || freshToken?.audit || null,
    socials: freshToken?.socials || oldToken?.socials || {},
    boosts: Math.max(n(oldToken?.boosts), n(freshToken?.boosts)),
    profileUrl: freshToken?.profileUrl || oldToken?.profileUrl || null,
    liveUpdatedAt: now
  };

  if (!incomingIsBirdeye && hasFreshBirdeyeLock(oldToken, now)) {
    for (const field of MARKET_VALUE_FIELDS) mergedInput[field] = oldToken[field];
  }

  return normalizeToken(mergedInput);
}

function trackedTokenMetadata(address) {
  const existing = state.tokens.find(token => token.tokenAddress === address);
  if (existing) return existing;
  return realtimeTokenMeta.get(address) || {
    tokenAddress: address,
    id: address,
    symbol: `${address.slice(0, 4)}…${address.slice(-4)}`,
    name: "Token SPL",
    quoteSymbol: "SOL",
    dexId: "Solana",
    source: "Wallet",
    createdAt: Date.now(),
    ageMinutes: 0,
    score: 0,
    grade: "—",
    signal: "Theo dõi vị thế",
    riskFlags: []
  };
}

function applyBirdeyeTokenStats(data) {
  const address = String(data?.address || "").trim();
  const priceUsd = n(data?.price);
  if (!address || !(priceUsd > 0)) return null;

  const sourceAt = Math.max(
    n(data?.last_trade_unix_time) * 1_000,
    Date.parse(data?.last_trade_human_time || "") || 0,
    Date.now() - 1
  );
  const marketCap = CONFIG.birdeyeMcMode === "marketcap"
    ? n(data?.marketcap, n(data?.fdv))
    : n(data?.fdv, n(data?.marketcap));

  const fresh = {
    ...trackedTokenMetadata(address),
    tokenAddress: address,
    id: address,
    source: "Birdeye",
    marketSource: "Birdeye WS",
    marketSourceAt: sourceAt,
    marketReceivedAt: Date.now(),
    lastTradeAt: sourceAt,
    priceUsd,
    marketCap,
    fdv: n(data?.fdv, marketCap),
    liquidityUsd: n(data?.liquidity),
    volume1h: n(data?.volume_1h_usd),
    volume24h: n(data?.volume_24h_usd),
    priceChange1h: n(data?.price_change_1h_percent),
    priceChange24h: n(data?.price_change_24h_percent),
    buys1h: n(data?.buy_1h),
    sells1h: n(data?.sell_1h),
    txns1h: n(data?.trade_1h),
    liveUpdatedAt: Date.now()
  };

  const index = state.tokens.findIndex(token => token.tokenAddress === address);
  const merged = mergeFastToken(index >= 0 ? state.tokens[index] : trackedTokenMetadata(address), fresh);
  if (index >= 0) state.tokens[index] = merged;
  else state.tokens.unshift(merged);

  pendingMarketDeltas.set(address, merged);
  queueMarketDeltaBroadcast();
  return merged;
}

function queueMarketDeltaBroadcast() {
  if (realtimeDeltaTimer) return;
  realtimeDeltaTimer = setTimeout(() => {
    realtimeDeltaTimer = null;
    if (!pendingMarketDeltas.size) return;
    const tokens = [...pendingMarketDeltas.values()];
    pendingMarketDeltas.clear();
    broadcastEvent("market_delta", {
      updatedAt: Date.now(),
      source: "Birdeye WS",
      tokens,
      realtime: publicRealtimeStatus()
    });
  }, CONFIG.realtimeBroadcastMs);
  realtimeDeltaTimer.unref?.();
}

function fastTrackedAddresses(limit = CONFIG.fastTickerMaxTokens) {
  const account = loadPaperAccount();
  const paperPositions = Object.keys(account.positions || {});
  const realPositions = [...realTrackedMints];
  const watch = getWatchlist().map(item => item.tokenAddress).filter(Boolean);
  const ranked = [...(state.tokens || [])]
    .sort((a, b) => n(b.score) - n(a.score) || n(b.volume5m) - n(a.volume5m))
    .map(token => token.tokenAddress)
    .filter(Boolean);

  return [...new Set([...realPositions, ...paperPositions, ...watch, ...ranked])]
    .slice(0, limit);
}

function publicRealtimeStatus() {
  return {
    configured: birdeyeStatus.configured,
    connected: birdeyeStatus.connected,
    status: birdeyeStatus.status,
    subscribedTokens: birdeyeStatus.subscribedTokens,
    lastMessageAt: birdeyeStatus.lastMessageAt,
    lastError: birdeyeStatus.lastError,
    source: birdeyeStatus.connected ? "Birdeye WebSocket" : "DEX REST fallback",
    mcMode: CONFIG.birdeyeMcMode
  };
}

function birdeyeSubscribeNow(force = false) {
  if (!birdeyeSocket || birdeyeSocket.readyState !== WebSocket.OPEN) return;
  const addresses = fastTrackedAddresses(CONFIG.birdeyeWsMaxTokens);
  const key = addresses.join(",");
  if (!force && key === birdeyeSubscriptionKey) return;
  birdeyeSubscriptionKey = key;
  birdeyeStatus.subscribedTokens = addresses.length;
  if (!addresses.length) return;

  birdeyeSocket.send(JSON.stringify({
    type: "SUBSCRIBE_TOKEN_STATS",
    data: {
      address: addresses,
      select: {
        price: true,
        fdv: true,
        marketcap: true,
        supply: true,
        last_trade: true,
        liquidity: true
      }
    }
  }));
}

function scheduleBirdeyeResubscribe() {
  if (!birdeyeStatus.configured) return;
  clearTimeout(birdeyeResubscribeTimer);
  birdeyeResubscribeTimer = setTimeout(
    () => birdeyeSubscribeNow(false),
    CONFIG.birdeyeWsResubscribeMs
  );
  birdeyeResubscribeTimer.unref?.();
}

function scheduleBirdeyeReconnect() {
  if (!birdeyeStatus.configured || shuttingDown) return;
  clearTimeout(birdeyeReconnectTimer);
  birdeyeReconnectAttempt += 1;
  const wait = Math.min(
    CONFIG.birdeyeReconnectMaxMs,
    1_000 * (2 ** Math.min(birdeyeReconnectAttempt, 5))
  );
  birdeyeStatus.reconnects += 1;
  birdeyeReconnectTimer = setTimeout(connectBirdeyeWebSocket, wait);
  birdeyeReconnectTimer.unref?.();
}

function connectBirdeyeWebSocket() {
  if (!birdeyeStatus.configured || shuttingDown) return;
  if (birdeyeSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(birdeyeSocket.readyState)) return;

  const separator = CONFIG.birdeyeWsUrl.includes("?") ? "&" : "?";
  const url = `${CONFIG.birdeyeWsUrl}${separator}x-api-key=${encodeURIComponent(CONFIG.birdeyeApiKey)}`;
  birdeyeStatus.status = "connecting";
  birdeyeStatus.lastError = null;

  // Node 22 provides a native WebSocket client. The requested subprotocol
  // produces the Sec-WebSocket-Protocol header required by Birdeye.
  const socket = new WebSocket(url, "echo-protocol");
  birdeyeSocket = socket;

  socket.addEventListener("open", () => {
    if (birdeyeSocket !== socket) return;
    birdeyeReconnectAttempt = 0;
    birdeyeStatus.connected = true;
    birdeyeStatus.status = "connected";
    birdeyeStatus.lastError = null;
    birdeyeSubscriptionKey = "";
    birdeyeSubscribeNow(true);
    broadcastEvent("realtime_status", publicRealtimeStatus());
  });

  socket.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(String(event.data || "")); }
    catch { return; }

    if (message?.type === "TOKEN_STATS_DATA" && message?.data) {
      birdeyeStatus.lastMessageAt = Date.now();
      birdeyeStatus.status = "streaming";
      applyBirdeyeTokenStats(message.data);
      return;
    }
    if (message?.type === "ERROR" || message?.error) {
      birdeyeStatus.lastError = String(message?.error || message?.message || "Birdeye WebSocket error").slice(0, 300);
      broadcastEvent("realtime_status", publicRealtimeStatus());
    }
  });

  socket.addEventListener("error", event => {
    if (birdeyeSocket !== socket) return;
    birdeyeStatus.lastError = String(event?.message || "WebSocket connection error").slice(0, 300);
    birdeyeStatus.status = "error";
    broadcastEvent("realtime_status", publicRealtimeStatus());
  });

  socket.addEventListener("close", event => {
    if (birdeyeSocket !== socket) return;
    birdeyeSocket = null;
    birdeyeStatus.connected = false;
    birdeyeStatus.status = "disconnected";
    if (event.code !== 1000) {
      birdeyeStatus.lastError = `WS ${event.code}${event.reason ? `: ${event.reason}` : ""}`;
    }
    broadcastEvent("realtime_status", publicRealtimeStatus());
    scheduleBirdeyeReconnect();
  });
}


async function fetchFastMarket(addresses) {
  const updates = new Map();
  const chunks = [];
  for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));
  const results = await Promise.allSettled(
    chunks.map(chunk => fetchJson(`${CONFIG.dexApi}/tokens/v1/solana/${chunk.join(",")}`))
  );
  const allPairs = [];
  for (const result of results) {
    if (result.status === "rejected") continue;
    allPairs.push(...(Array.isArray(result.value) ? result.value : result.value?.pairs || []));
  }
  for (const address of addresses) {
    const pair = chooseBestPairForToken(allPairs, address);
    if (pair) updates.set(address, parseDexPair(pair));
  }
  return updates;
}

async function runFastTicker() {
  if (!CONFIG.fastTickerEnabled || fastTickerRunning) return;
  fastTickerRunning = true;
  try {
    if (CONFIG.mockMode) {
      mockTick++;
      const fresh = mockTokens(mockTick);
      const byAddress = new Map(fresh.map(token => [token.tokenAddress, token]));
      state.tokens = state.tokens.map(token => byAddress.has(token.tokenAddress)
        ? mergeFastToken(token, byAddress.get(token.tokenAddress))
        : token);
    } else {
      const addresses = fastTrackedAddresses();
      if (addresses.length) {
        const updates = await fetchFastMarket(addresses);
        const existing = new Map((state.tokens || []).map(token => [token.tokenAddress, token]));
        for (const [address, fresh] of updates) {
          existing.set(address, mergeFastToken(existing.get(address) || {}, fresh));
        }
        state.tokens = [...existing.values()]
          .sort((a, b) => n(b.score) - n(a.score) || n(b.volume5m) - n(a.volume5m))
          .slice(0, CONFIG.maxCandidates);
      }
    }
    fastTickerUpdatedAt = Date.now();
    fastTickerError = null;
    scheduleBirdeyeResubscribe();
    const paper = await paperView({ includeTrades: false });
    broadcastEvent("ticker", {
      updatedAt: fastTickerUpdatedAt,
      intervalMs: CONFIG.fastTickerMs,
      tokens: state.tokens,
      paper
    });
  } catch (error) {
    fastTickerError = error.message;
    broadcastEvent("ticker_error", { updatedAt: Date.now(), error: fastTickerError });
  } finally {
    fastTickerRunning = false;
    clearTimeout(fastTickerTimer);
    fastTickerTimer = setTimeout(runFastTicker, CONFIG.fastTickerMs);
  }
}

function broadcastEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

function publicState() {
  return {
    ...state,
    config: {
      scanIntervalMs: CONFIG.scanIntervalMs,
      fastTickerEnabled: CONFIG.fastTickerEnabled,
      fastTickerMs: CONFIG.fastTickerMs,
      fastTickerUpdatedAt,
      fastTickerError,
      realtime: publicRealtimeStatus(),
      rpcAudit: CONFIG.rpcAudit,
      mockMode: CONFIG.mockMode,
      geckoEnabled: CONFIG.geckoEnabled,
      geckoRefreshMs: CONFIG.geckoRefreshMs,
      geckoBlockedUntil,
      paperTrading: true,
      realTrading: true,
      realWalletPollMs: CONFIG.realWalletPollMs,
      jupiterReady: true
    }
  };
}

function broadcast() {
  broadcastEvent("scan", publicState());
}

function serveStatic(req, res, pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const safe = path.normalize(target).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { ...securityHeaders(), "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Không tìm thấy");
  }
  const ext = path.extname(file).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  };
  const data = fs.readFileSync(file);
  res.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Content-Length": data.length,
    "Cache-Control": "no-store, no-cache, must-revalidate"
  });
  res.end(data);
}

function getWatchlist() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getWatchlistFile(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setWatchlist(items) {
  fs.writeFileSync(getWatchlistFile(), JSON.stringify(items.slice(0, 200), null, 2));
}

function normalizeHiddenMeme(item) {
  const tokenAddress = String(item?.tokenAddress || "").trim().slice(0, 64);
  if (!tokenAddress) return null;
  return {
    tokenAddress,
    symbol: String(item?.symbol || "???").trim().slice(0, 18),
    name: String(item?.name || "").trim().slice(0, 80),
    pairAddress: String(item?.pairAddress || "").trim().slice(0, 64),
    dexId: String(item?.dexId || "").trim().slice(0, 40),
    priceUsd: n(item?.priceUsd),
    marketCap: n(item?.marketCap),
    liquidityUsd: n(item?.liquidityUsd),
    hiddenAt: n(item?.hiddenAt, Date.now()),
    updatedAt: Date.now()
  };
}

function getHiddenMemes() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getHiddenMemesFile(), "utf8"));
    if (!Array.isArray(parsed)) return [];
    const unique = new Map();
    for (const raw of parsed) {
      const item = normalizeHiddenMeme(raw);
      if (item) unique.set(item.tokenAddress, item);
    }
    return [...unique.values()].sort((a, b) => b.hiddenAt - a.hiddenAt);
  } catch {
    return [];
  }
}

function setHiddenMemes(items) {
  const unique = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeHiddenMeme(raw);
    if (item) unique.set(item.tokenAddress, item);
  }
  const saved = [...unique.values()]
    .sort((a, b) => b.hiddenAt - a.hiddenAt)
    .slice(0, 2000);
  const file = getHiddenMemesFile();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(saved, null, 2));
  fs.renameSync(temp, file);
  return saved;
}

function updateHiddenMemes(body) {
  const action = String(body?.action || "hide").toLowerCase();
  const items = getHiddenMemes();

  if (action === "unhide_all") {
    setHiddenMemes([]);
    return { items: [], hidden: false, action };
  }

  const tokenAddress = String(body?.tokenAddress || "").trim();
  if (!tokenAddress) throw new Error("Thiếu tokenAddress");
  const index = items.findIndex(item => item.tokenAddress === tokenAddress);

  if (action === "unhide") {
    if (index >= 0) items.splice(index, 1);
    return { items: setHiddenMemes(items), hidden: false, action };
  }

  const item = normalizeHiddenMeme({
    ...body,
    tokenAddress,
    hiddenAt: index >= 0 ? items[index].hiddenAt : Date.now()
  });
  if (!item) throw new Error("Token không hợp lệ");
  if (index >= 0) items.splice(index, 1);
  items.unshift(item);
  return { items: setHiddenMemes(items), hidden: true, action: "hide" };
}


function defaultPaperAccount() {
  return {
    version: 3,
    profileId: activeProfile().id,
    initialUsd: CONFIG.paperStartUsd,
    netDepositsUsd: CONFIG.paperStartUsd,
    totalDepositedUsd: CONFIG.paperStartUsd,
    usdBalance: CONFIG.paperStartUsd,
    solBalance: 0,
    startingSolPct: CONFIG.paperStartSolPct,
    positions: {},
    trades: [],
    realizedPnlUsd: 0,
    feesPaidUsd: 0,
    initialized: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function loadPaperAccount() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getPaperFile(), "utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    const merged = { ...defaultPaperAccount(), ...parsed, positions: parsed.positions || {}, trades: parsed.trades || [] };
    merged.netDepositsUsd = n(parsed.netDepositsUsd, n(parsed.initialUsd, CONFIG.paperStartUsd));
    merged.totalDepositedUsd = n(parsed.totalDepositedUsd, merged.netDepositsUsd);
    merged.profileId = activeProfile().id;
    return merged;
  } catch {
    return defaultPaperAccount();
  }
}

function savePaperAccount(account) {
  account.profileId = activeProfile().id;
  account.updatedAt = Date.now();
  account.trades = (account.trades || []).slice(0, CONFIG.paperHistoryLimit);
  const file = getPaperFile();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(account, null, 2));
  fs.renameSync(temp, file);
  const profile = activeProfile();
  profile.updatedAt = account.updatedAt;
  saveProfileStore(profileStore);
}

function withPaperLock(task) {
  const run = paperLock.then(task, task);
  paperLock = run.catch(() => {});
  return run;
}

async function getSolPriceUsd(force = false) {
  if (CONFIG.mockMode) { solPriceCache = { value: 160, fetchedAt: Date.now() }; return 160; }
  if (!force && solPriceCache.value > 0 && Date.now() - solPriceCache.fetchedAt < 12_000) {
    return solPriceCache.value;
  }
  try {
    const payload = await fetchJson(`${CONFIG.dexApi}/tokens/v1/solana/${SOL_MINT}`);
    const pairs = Array.isArray(payload) ? payload : payload?.pairs || [];
    const stable = pairs
      .filter(pair => ["USDC", "USDT", "USD1", "USDG"].includes(String(pair.quoteToken?.symbol || "").toUpperCase()))
      .sort((a, b) => n(b.liquidity?.usd) - n(a.liquidity?.usd));
    const price = n((stable[0] || pairs[0])?.priceUsd);
    if (price > 0) {
      solPriceCache = { value: price, fetchedAt: Date.now() };
      return price;
    }
  } catch (error) {
    if (solPriceCache.value > 0) return solPriceCache.value;
  }
  const scannerSol = state.tokens.find(t => t.symbol === "SOL")?.priceUsd;
  if (n(scannerSol) > 0) return n(scannerSol);
  throw new Error("Không lấy được giá SOL/USD từ thị trường");
}

async function getTokenDecimals(mint) {
  if (CONFIG.mockMode && !tokenDecimalsCache.has(mint)) {
    tokenDecimalsCache.set(mint, 6);
    return 6;
  }
  if (tokenDecimalsCache.has(mint)) return tokenDecimalsCache.get(mint);
  try {
    const account = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const decimals = account?.value?.data?.parsed?.info?.decimals;
    if (Number.isInteger(decimals)) {
      tokenDecimalsCache.set(mint, decimals);
      return decimals;
    }
  } catch {}
  // Chỉ dùng để paper trade. Giá trị USD vẫn dựa trên giá pool thật.
  tokenDecimalsCache.set(mint, 6);
  return 6;
}


const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function isSolanaPublicKey(value) {
  const input = String(value || "").trim();
  if (input.length < 32 || input.length > 44) return false;
  let number = 0n;
  try {
    for (const char of input) {
      const index = BASE58_ALPHABET.indexOf(char);
      if (index < 0) return false;
      number = number * 58n + BigInt(index);
    }
  } catch {
    return false;
  }

  let bytes = 0;
  let temp = number;
  while (temp > 0n) {
    bytes++;
    temp >>= 8n;
  }
  let leadingZeroes = 0;
  while (input[leadingZeroes] === "1") leadingZeroes++;
  return bytes + leadingZeroes === 32;
}


function normaliseJupiterV1Quote(quote, fallbackSlippageBps) {
  return {
    ...quote,
    mode: "jupiter-v1",
    router: "metis",
    slippageBps: n(quote.slippageBps, fallbackSlippageBps),
    priceImpact: n(quote.priceImpactPct) * 100,
    signatureFeeLamports: CONFIG.paperBaseFeeLamports,
    prioritizationFeeLamports: CONFIG.paperPriorityFeeLamports,
    rentFeeLamports: 0,
    gasless: false,
    transaction: null,
    platformFee: quote.platformFee || { amount: "0", feeBps: 0, feeMint: quote.inputMint },
    feeBps: n(quote.platformFee?.feeBps),
    quoteSource: "Jupiter V1"
  };
}

async function getJupiterV2Quote({ inputMint, outputMint, amountRaw, slippageBps }) {
  if (!CONFIG.jupiterApiKey) throw new Error("Thiếu JUPITER_API_KEY");
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountRaw)
  });
  // V2 supports quote-only without taker. Slippage override is optional.
  if (Number(slippageBps) > 0) {
    params.set("slippageBps", String(Math.min(10_000, Math.max(0, Math.round(slippageBps)))));
  }

  const order = await fetchJson(`${CONFIG.jupiterBaseUrl}/order?${params}`, {
    headers: { "x-api-key": CONFIG.jupiterApiKey }
  });

  if (order?.error && !order.outAmount) throw new Error(String(order.error));
  if (!order?.outAmount || !/^\d+$/.test(String(order.outAmount)) || BigInt(String(order.outAmount)) <= 0n) {
    throw new Error(order?.errorMessage || "Jupiter V2 không tìm được route");
  }
  return {
    ...order,
    transaction: order.transaction ?? null,
    quoteSource: "Jupiter V2"
  };
}

async function getJupiterV1Quote({ inputMint, outputMint, amountRaw, slippageBps }) {
  if (!CONFIG.jupiterApiKey) throw new Error("Thiếu JUPITER_API_KEY");
  const appliedSlippage = Number(slippageBps) > 0
    ? Math.min(10_000, Math.max(1, Math.round(slippageBps)))
    : CONFIG.paperFallbackSlippageBps;

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountRaw),
    swapMode: "ExactIn",
    slippageBps: String(appliedSlippage),
    restrictIntermediateTokens: "true",
    instructionVersion: "V2"
  });

  const quote = await fetchJson(`${CONFIG.jupiterV1BaseUrl}/quote?${params}`, {
    headers: { "x-api-key": CONFIG.jupiterApiKey }
  });
  if (quote?.error && !quote.outAmount) throw new Error(String(quote.error));
  if (!quote?.outAmount || !/^\d+$/.test(String(quote.outAmount)) || BigInt(String(quote.outAmount)) <= 0n) {
    throw new Error(quote?.errorMessage || "Jupiter V1 không tìm được route");
  }
  return normaliseJupiterV1Quote(quote, appliedSlippage);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function makeDexPoolQuote({
  side,
  token,
  inputMint,
  outputMint,
  amountRaw,
  inputDecimals,
  outputDecimals,
  solPriceUsd,
  slippageBps,
  fallbackReason
}) {
  const isStableSwap = (inputMint === SOL_MINT && outputMint === USDC_MINT) ||
    (inputMint === USDC_MINT && outputMint === SOL_MINT);

  const tokenPriceUsd = isStableSwap
    ? (outputMint === SOL_MINT || inputMint === SOL_MINT ? solPriceUsd : 1)
    : n(token?.priceUsd, n(token?.lastPriceUsd, n(token?.avgEntryUsd)));

  if (!isStableSwap && tokenPriceUsd <= 0) {
    throw new Error("Token chưa có giá USD thật để mô phỏng DEX");
  }

  const liquidityUsd = Math.max(
    isStableSwap ? 50_000_000 : CONFIG.paperFallbackLiquidityUsd,
    n(token?.liquidityUsd, CONFIG.paperFallbackLiquidityUsd)
  );
  if (!isStableSwap && liquidityUsd <= 0) {
    throw new Error("Token chưa có dữ liệu thanh khoản để mô phỏng");
  }

  const feeBps = isStableSwap ? CONFIG.paperStableFeeBps : CONFIG.paperDexFeeBps;
  const feeRate = feeBps / 10_000;
  const appliedSlippageBps = Number(slippageBps) > 0
    ? clampNumber(slippageBps, 1, 10_000)
    : CONFIG.paperFallbackSlippageBps;

  const inputUi = rawToUi(amountRaw, inputDecimals);
  let inputUsd = 0;
  let outputUi = 0;
  let outputUsd = 0;

  if (inputMint === SOL_MINT) inputUsd = inputUi * solPriceUsd;
  else if (inputMint === USDC_MINT) inputUsd = inputUi;
  else inputUsd = inputUi * tokenPriceUsd;

  const quoteReserveUsd = liquidityUsd / 2;

  if (outputMint !== SOL_MINT && outputMint !== USDC_MINT) {
    // Buy token: x = quote-side reserve, y = token reserve.
    const tokenReserve = quoteReserveUsd / tokenPriceUsd;
    const netInputUsd = inputUsd * (1 - feeRate);
    outputUi = tokenReserve * netInputUsd / (quoteReserveUsd + netInputUsd);
    outputUsd = outputUi * tokenPriceUsd;
  } else if (inputMint !== SOL_MINT && inputMint !== USDC_MINT) {
    // Sell token back to the quote side.
    const tokenReserve = quoteReserveUsd / tokenPriceUsd;
    const netInputToken = inputUi * (1 - feeRate);
    outputUsd = quoteReserveUsd * netInputToken / (tokenReserve + netInputToken);
    outputUi = outputMint === SOL_MINT ? outputUsd / solPriceUsd : outputUsd;
  } else {
    // SOL <-> USDC fallback with deep market liquidity.
    const netInputUsd = inputUsd * (1 - feeRate);
    outputUsd = quoteReserveUsd * netInputUsd / (quoteReserveUsd + netInputUsd);
    outputUi = outputMint === SOL_MINT ? outputUsd / solPriceUsd : outputUsd;
  }

  if (!Number.isFinite(outputUi) || outputUi <= 0) {
    throw new Error("Không thể tính khớp lệnh từ dữ liệu pool");
  }

  const noImpactOutputUi = outputMint === SOL_MINT
    ? inputUsd / solPriceUsd
    : outputMint === USDC_MINT
      ? inputUsd
      : inputUsd / tokenPriceUsd;

  const priceImpactPct = Math.max(0, (1 - outputUi / Math.max(noImpactOutputUi, 1e-18)) * 100);
  const outRaw = uiToRaw(outputUi, outputDecimals);
  const thresholdRaw = String(
    BigInt(outRaw) * BigInt(Math.max(0, 10_000 - Math.round(appliedSlippageBps))) / 10_000n
  );

  return {
    mode: "dex-market-fallback",
    inputMint,
    outputMint,
    inAmount: String(amountRaw),
    outAmount: String(outRaw),
    otherAmountThreshold: thresholdRaw,
    inUsdValue: inputUsd,
    outUsdValue: outputUsd,
    swapUsdValue: outputUsd,
    priceImpact: priceImpactPct,
    priceImpactPct: String(priceImpactPct / 100),
    slippageBps: appliedSlippageBps,
    feeBps,
    platformFee: { amount: "0", feeBps: 0, feeMint: inputMint },
    signatureFeeLamports: CONFIG.paperBaseFeeLamports,
    prioritizationFeeLamports: CONFIG.paperPriorityFeeLamports,
    rentFeeLamports: 0,
    gasless: false,
    router: String(token?.dexId || "DEX"),
    routePlan: [{ swapInfo: { label: `${token?.dexId || "DEX"} pool` }, percent: 100 }],
    transaction: null,
    quoteSource: "DEX pool simulation",
    approximation: true,
    fallbackReason: String(fallbackReason || "Jupiter không khả dụng").slice(0, 500),
    liquidityUsd,
    marketDataAt: state.updatedAt || Date.now()
  };
}

function rawToUi(raw, decimals) {
  const base = 10n ** BigInt(decimals);
  const value = BigInt(String(raw || "0"));
  return Number(value / base) + Number(value % base) / (10 ** decimals);
}

function uiToRaw(ui, decimals) {
  const number = Number(ui);
  if (!Number.isFinite(number) || number <= 0) throw new Error("Số lượng không hợp lệ");
  return String(Math.floor(number * (10 ** decimals)));
}

function choosePaperFillRaw(order, mode = CONFIG.paperFillMode) {
  const quoted = BigInt(order.outAmount || "0");
  const threshold = BigInt(order.otherAmountThreshold || order.outAmount || "0");
  if (mode === "worst") return threshold;
  if (mode === "quote") return quoted;
  return threshold + ((quoted - threshold) / 2n);
}

function routeLabels(order) {
  return [...new Set((order.routePlan || []).map(x => x?.swapInfo?.label).filter(Boolean))];
}

async function getJupiterOrder({ inputMint, outputMint, amountRaw, slippageBps }) {
  if (CONFIG.mockMode) {
    return {
      ...mockJupiterOrder({ inputMint, outputMint, amountRaw, slippageBps }),
      quoteSource: "Jupiter mock"
    };
  }

  if (!isSolanaPublicKey(inputMint)) throw new Error(`Input mint không hợp lệ: ${inputMint}`);
  if (!isSolanaPublicKey(outputMint)) throw new Error(`Output mint không hợp lệ: ${outputMint}`);
  if (!/^\d+$/.test(String(amountRaw)) || BigInt(String(amountRaw)) <= 0n) {
    throw new Error("Số lượng quote không hợp lệ");
  }
  if (!CONFIG.jupiterApiKey) {
    throw new Error("Chưa cấu hình JUPITER_API_KEY");
  }

  const failures = [];
  try {
    return await getJupiterV2Quote({ inputMint, outputMint, amountRaw, slippageBps });
  } catch (error) {
    failures.push(`V2: ${error.message}`);
  }

  try {
    return await getJupiterV1Quote({ inputMint, outputMint, amountRaw, slippageBps });
  } catch (error) {
    failures.push(`V1: ${error.message}`);
  }

  throw new Error(failures.join(" | "));
}

function mockJupiterOrder({ inputMint, outputMint, amountRaw, slippageBps }) {
  const solPrice = solPriceCache.value || 160;
  const token = state.tokens.find(t => t.tokenAddress === inputMint || t.tokenAddress === outputMint);
  const inputDecimals = inputMint === SOL_MINT ? 9 : inputMint === USDC_MINT ? 6 : 6;
  const outputDecimals = outputMint === SOL_MINT ? 9 : outputMint === USDC_MINT ? 6 : 6;
  const inUi = rawToUi(amountRaw, inputDecimals);
  const inputUsd = inputMint === SOL_MINT ? inUi * solPrice : inputMint === USDC_MINT ? inUi : inUi * n(token?.priceUsd, 0.00001);
  const outputPrice = outputMint === SOL_MINT ? solPrice : outputMint === USDC_MINT ? 1 : n(token?.priceUsd, 0.00001);
  const impactPct = Math.min(8, inputUsd / Math.max(1, n(token?.liquidityUsd, 20_000)) * 50);
  const outUi = inputUsd * (1 - impactPct / 100) / outputPrice;
  const outRaw = BigInt(Math.max(1, Math.floor(outUi * (10 ** outputDecimals))));
  const slip = Number(slippageBps) > 0 ? Number(slippageBps) : 300;
  return {
    mode: "paper-mock", inputMint, outputMint, inAmount: String(amountRaw), outAmount: String(outRaw),
    inUsdValue: inputUsd, outUsdValue: outUi * outputPrice, swapUsdValue: outUi * outputPrice,
    priceImpact: -impactPct, otherAmountThreshold: String(outRaw * BigInt(10_000 - slip) / 10_000n),
    slippageBps: slip, feeBps: 10, platformFee: { amount: "0", feeBps: 10, feeMint: SOL_MINT },
    signatureFeeLamports: 5_000, prioritizationFeeLamports: 50_000, rentFeeLamports: 0,
    gasless: false, router: "mock", routePlan: [{ swapInfo: { label: "Mock Route" }, percent: 100 }]
  };
}

async function ensurePaperInitialized(force = false, initialUsd, solPct) {
  const account = loadPaperAccount();
  if (account.initialized && !force) return account;
  const capital = Math.max(10, Math.min(1_000_000, n(initialUsd, CONFIG.paperStartUsd)));
  const allocation = Math.max(0, Math.min(100, n(solPct, CONFIG.paperStartSolPct)));
  const solPrice = await getSolPriceUsd();
  const solUsd = capital * allocation / 100;
  const reset = defaultPaperAccount();
  reset.initialUsd = capital;
  reset.netDepositsUsd = capital;
  reset.totalDepositedUsd = capital;
  reset.profileId = activeProfile().id;
  reset.startingSolPct = allocation;
  reset.usdBalance = capital - solUsd;
  reset.solBalance = solUsd / solPrice;
  reset.initialized = true;
  reset.createdAt = Date.now();
  savePaperAccount(reset);
  return reset;
}

function currentTokenPrice(tokenAddress, position) {
  const token = state.tokens.find(t => t.tokenAddress === tokenAddress);
  return n(token?.priceUsd, n(position?.lastPriceUsd, n(position?.avgEntryUsd)));
}

async function fetchSingleTokenMarket(tokenAddress) {
  if (CONFIG.mockMode) return state.tokens.find(t => t.tokenAddress === tokenAddress) || null;
  try {
    const payload = await fetchJson(`${CONFIG.dexApi}/tokens/v1/solana/${tokenAddress}`);
    const pairs = Array.isArray(payload) ? payload : payload?.pairs || [];
    const pair = chooseBestPairForToken(pairs, tokenAddress);
    if (!pair) return null;
    const fresh = parseDexPair(pair);
    const existingIndex = state.tokens.findIndex(t => t.tokenAddress === tokenAddress);
    const merged = mergeFastToken(existingIndex >= 0 ? state.tokens[existingIndex] : {}, fresh);
    if (existingIndex >= 0) state.tokens[existingIndex] = merged;
    else state.tokens.unshift(merged);
    return merged;
  } catch { return null; }
}

async function resolvePaperTokenMarket(tokenAddress, fallback = {}) {
  let live = state.tokens.find(t => t.tokenAddress === tokenAddress);
  if (!n(live?.priceUsd)) live = await fetchSingleTokenMarket(tokenAddress) || live;
  const priceUsd = n(live?.priceUsd, n(fallback.priceUsd, n(fallback.lastPriceUsd, n(fallback.avgEntryUsd))));
  const marketCap = n(live?.marketCap, n(fallback.marketCap, n(fallback.currentMarketCap, n(fallback.lastMarketCap, n(fallback.avgEntryMarketCap)))));
  const liquidityUsd = n(live?.liquidityUsd, n(fallback.liquidityUsd, CONFIG.paperFallbackLiquidityUsd));
  return {
    ...fallback,
    ...(live || {}),
    tokenAddress,
    priceUsd,
    lastPriceUsd: priceUsd,
    marketCap,
    lastMarketCap: marketCap,
    liquidityUsd,
    marketDataAt: n(live?.liveUpdatedAt, n(fallback.marketDataAt, Date.now()))
  };
}

function pnlAnalytics(account) {
  const sells = (account.trades || []).filter(t => t.type === "SELL");
  const winning = sells.filter(t => n(t.pnlUsd) > 0);
  const losing = sells.filter(t => n(t.pnlUsd) < 0);
  return {
    closedTrades: sells.length,
    wins: winning.length,
    losses: losing.length,
    winRate: sells.length ? winning.length / sells.length * 100 : 0,
    averageWinUsd: winning.length ? winning.reduce((s,t) => s + n(t.pnlUsd), 0) / winning.length : 0,
    averageLossUsd: losing.length ? losing.reduce((s,t) => s + n(t.pnlUsd), 0) / losing.length : 0,
    bestTradeUsd: sells.length ? Math.max(...sells.map(t => n(t.pnlUsd))) : 0,
    worstTradeUsd: sells.length ? Math.min(...sells.map(t => n(t.pnlUsd))) : 0
  };
}

async function paperView(options = {}) {
  const account = await ensurePaperInitialized();
  const solPriceUsd = await getSolPriceUsd();
  const positions = Object.values(account.positions || {}).map(position => {
    const liveToken = state.tokens.find(t => t.tokenAddress === position.tokenAddress);
    const priceUsd = n(liveToken?.priceUsd, n(position?.lastPriceUsd, n(position?.avgEntryUsd)));
    const currentMarketCap = n(liveToken?.marketCap, n(position?.lastMarketCap, n(position?.avgEntryMarketCap)));
    const entryMarketCap = n(position.avgEntryMarketCap, n(position.marketCapAtFirstBuy));
    const marketValueUsd = position.quantity * priceUsd;
    const unrealizedPnlUsd = marketValueUsd - position.costBasisUsd;
    return {
      ...position,
      priceUsd,
      currentMarketCap,
      entryMarketCap,
      marketCapChangePct: entryMarketCap > 0 ? (currentMarketCap - entryMarketCap) / entryMarketCap * 100 : 0,
      marketValueUsd,
      unrealizedPnlUsd,
      pnlPct: position.costBasisUsd > 0 ? unrealizedPnlUsd / position.costBasisUsd * 100 : 0,
      liveUpdatedAt: n(liveToken?.liveUpdatedAt, fastTickerUpdatedAt)
    };
  }).filter(p => p.quantity > 0);
  const positionsValueUsd = positions.reduce((sum, p) => sum + p.marketValueUsd, 0);
  const equityUsd = account.usdBalance + account.solBalance * solPriceUsd + positionsValueUsd;
  const netDepositsUsd = n(account.netDepositsUsd, n(account.initialUsd));
  return {
    profile: activeProfile(),
    profiles: publicProfiles(),
    account: { ...account, netDepositsUsd, trades: options.includeTrades === false ? (account.trades || []).slice(0, 60) : (account.trades || []), positions },
    summary: {
      solPriceUsd,
      positionsValueUsd,
      equityUsd,
      netDepositsUsd,
      totalDepositedUsd: n(account.totalDepositedUsd, netDepositsUsd),
      totalPnlUsd: equityUsd - netDepositsUsd,
      totalPnlPct: netDepositsUsd > 0 ? (equityUsd - netDepositsUsd) / netDepositsUsd * 100 : 0,
      unrealizedPnlUsd: positions.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0),
      realizedPnlUsd: account.realizedPnlUsd,
      feesPaidUsd: account.feesPaidUsd,
      analytics: pnlAnalytics(account)
    },
    config: {
      version: CONFIG.appVersion,
      jupiterReady: Boolean(CONFIG.jupiterApiKey),
      jupiterMode: CONFIG.mockMode ? "mock" : CONFIG.jupiterApiKey ? "v2+v1" : "dex-fallback",
      quoteMode: CONFIG.paperQuoteMode,
      fillMode: CONFIG.paperFillMode,
      defaultSlippageBps: CONFIG.paperDefaultSlippageBps,
      takerAddress: CONFIG.paperTakerAddress,
      fastTickerMs: CONFIG.fastTickerMs,
      fees: {
        signatureLamports: CONFIG.paperBaseFeeLamports,
        priorityLamports: CONFIG.paperPriorityFeeLamports,
        ataRentLamports: CONFIG.paperAtaRentLamports,
        dexFeeBps: CONFIG.paperDexFeeBps
      },
      instantPresets: {
        P1: [0.01, 0.02, 0.06, 1],
        P2: [0.001, 0.01, 0.03, 0.05],
        P3: [0.02, 0.04, 0.08, 0.1]
      }
    }
  };
}

async function buildPaperQuote(body) {
  const side = String(body.side || "buy");
  const fillMode = ["quote", "mid", "worst"].includes(body.fillMode) ? body.fillMode : CONFIG.paperFillMode;
  const slippageBps = Number.isFinite(Number(body.slippageBps)) ? Number(body.slippageBps) : CONFIG.paperDefaultSlippageBps;
  const solPriceUsd = await getSolPriceUsd(true);
  let inputMint, outputMint, amountRaw, inputDecimals, outputDecimals, token, quantity;

  if (side === "buy") {
    token = state.tokens.find(t => t.tokenAddress === body.tokenAddress) || {
      tokenAddress: String(body.tokenAddress || ""),
      symbol: String(body.symbol || "TOKEN"),
      name: String(body.name || "Token"),
      priceUsd: n(body.priceUsd),
      marketCap: n(body.marketCap),
      liquidityUsd: n(body.liquidityUsd),
      dexId: String(body.dexId || "DEX"),
      pairAddress: String(body.pairAddress || "")
    };
    if (!token.tokenAddress) throw new Error("Thiếu địa chỉ token");
    if (!n(token.priceUsd) || !n(token.liquidityUsd)) token = await resolvePaperTokenMarket(token.tokenAddress, token);
    const requestedSol = n(body.amountSol);
    const requestedUsd = n(body.amountUsd);
    const amountSol = requestedSol > 0
      ? Math.max(0.000001, requestedSol)
      : Math.max(0.1, requestedUsd) / solPriceUsd;
    const amountUsd = amountSol * solPriceUsd;
    inputMint = SOL_MINT;
    outputMint = token.tokenAddress;
    inputDecimals = 9;
    outputDecimals = await getTokenDecimals(outputMint);
    amountRaw = uiToRaw(amountSol, inputDecimals);
  } else if (side === "sell") {
    const account = await ensurePaperInitialized();
    const position = account.positions?.[body.tokenAddress];
    if (!position || position.quantity <= 0) throw new Error("Không có vị thế token này");
    const percent = Math.max(0.1, Math.min(100, n(body.percent, 100)));
    quantity = position.quantity * percent / 100;
    token = await resolvePaperTokenMarket(position.tokenAddress, position);
    inputMint = position.tokenAddress;
    outputMint = SOL_MINT;
    inputDecimals = position.decimals;
    outputDecimals = 9;
    amountRaw = uiToRaw(quantity, inputDecimals);
  } else if (side === "usd_to_sol") {
    inputMint = USDC_MINT; outputMint = SOL_MINT; inputDecimals = 6; outputDecimals = 9;
    amountRaw = uiToRaw(Math.max(0.1, n(body.amountUsd)), 6);
    token = { symbol: "SOL", name: "Solana", tokenAddress: SOL_MINT };
  } else if (side === "sol_to_usd") {
    inputMint = SOL_MINT; outputMint = USDC_MINT; inputDecimals = 9; outputDecimals = 6;
    amountRaw = uiToRaw(Math.max(0.000001, n(body.amountSol)), 9);
    token = { symbol: "USDC", name: "USD Coin", tokenAddress: USDC_MINT };
  } else {
    throw new Error("Loại giao dịch không hợp lệ");
  }

  let order;
  let jupiterFailure = null;

  if (CONFIG.paperQuoteMode !== "dex") {
    try {
      order = await getJupiterOrder({ inputMint, outputMint, amountRaw, slippageBps });
    } catch (error) {
      jupiterFailure = error.message;
      if (CONFIG.paperQuoteMode === "jupiter") throw error;
    }
  }

  if (!order) {
    order = makeDexPoolQuote({
      side,
      token,
      inputMint,
      outputMint,
      amountRaw,
      inputDecimals,
      outputDecimals,
      solPriceUsd,
      slippageBps,
      fallbackReason: jupiterFailure || "PAPER_QUOTE_MODE=dex"
    });
  }

  const fillRaw = choosePaperFillRaw(order, fillMode);
  const accountForFees = await ensurePaperInitialized();
  const positionAlreadyExists = Boolean(accountForFees.positions?.[outputMint]);
  const needsAtaRent = side === "buy" && outputMint !== SOL_MINT && outputMint !== USDC_MINT && !positionAlreadyExists;
  const signatureLamports = n(order.signatureFeeLamports, CONFIG.paperBaseFeeLamports);
  const priorityLamports = n(order.prioritizationFeeLamports, CONFIG.paperPriorityFeeLamports);
  const rentLamports = n(order.rentFeeLamports, needsAtaRent ? CONFIG.paperAtaRentLamports : 0);
  const gasLamports = signatureLamports + priorityLamports + rentLamports;
  const gasSol = gasLamports / LAMPORTS_PER_SOL;
  const gasUsd = gasSol * solPriceUsd;
  const inputUi = rawToUi(order.inAmount || amountRaw, inputDecimals);
  const quotedOutputUi = rawToUi(order.outAmount, outputDecimals);
  const minimumOutputUi = rawToUi(order.otherAmountThreshold || order.outAmount, outputDecimals);
  const fillOutputUi = rawToUi(String(fillRaw), outputDecimals);
  const platformFeeRaw = order.platformFee?.amount || "0";
  const platformFeeDecimals = order.platformFee?.feeMint === inputMint ? inputDecimals : outputDecimals;
  const platformFeeUi = rawToUi(platformFeeRaw, platformFeeDecimals);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(), side, token, inputMint, outputMint, inputDecimals, outputDecimals,
    inputRaw: String(order.inAmount || amountRaw), inputUi, quotedOutputRaw: String(order.outAmount), quotedOutputUi,
    minimumOutputRaw: String(order.otherAmountThreshold || order.outAmount), minimumOutputUi,
    fillOutputRaw: String(fillRaw), fillOutputUi, fillMode,
    inUsdValue: n(order.inUsdValue, inputMint === SOL_MINT ? inputUi * solPriceUsd : inputMint === USDC_MINT ? inputUi : 0),
    outUsdValue: n(order.outUsdValue), swapUsdValue: n(order.swapUsdValue), solPriceUsd,
    priceImpactPct: Math.abs(n(order.priceImpact, n(order.priceImpactPct) * 100)),
    slippageBps: n(order.slippageBps, slippageBps), feeBps: n(order.feeBps),
    platformFee: { amountRaw: String(platformFeeRaw), amountUi: platformFeeUi, mint: order.platformFee?.feeMint || order.feeMint, feeBps: n(order.platformFee?.feeBps) },
    gas: { signatureLamports, priorityLamports, rentLamports, totalLamports: gasLamports, totalSol: gasSol, totalUsd: gasUsd, sponsored: Boolean(order.gasless), estimated: order.transaction == null },
    router: order.router || "metis", routes: routeLabels(order), mode: order.mode || "quote",
    quoteSource: order.quoteSource || "Jupiter",
    approximation: Boolean(order.approximation),
    fallbackReason: order.fallbackReason || null,
    liquidityUsd: n(order.liquidityUsd, n(token?.liquidityUsd)),
    marketDataAt: order.marketDataAt || state.updatedAt || Date.now(),
    marketCapAtQuote: n(token?.marketCap),
    tokenPriceAtQuote: n(token?.priceUsd),
    routeBuildError: null,
    quantity
  };
}

async function executePaperTrade(body) {
  return withPaperLock(async () => {
    const account = await ensurePaperInitialized();
    const quote = await buildPaperQuote(body);
    const gasSol = quote.gas.sponsored ? 0 : quote.gas.totalSol;
    const gasUsd = gasSol * quote.solPriceUsd;
    let trade;

    if (quote.side === "buy") {
      const inputSol = quote.inputUi;
      if (account.solBalance + 1e-12 < inputSol + gasSol) {
        throw new Error(`Không đủ SOL ảo. Cần ${(inputSol + gasSol).toFixed(6)} SOL gồm cả gas.`);
      }
      account.solBalance -= inputSol + gasSol;
      const mint = quote.token.tokenAddress;
      const old = account.positions[mint] || {
        tokenAddress: mint, symbol: quote.token.symbol || "TOKEN", name: quote.token.name || "Token",
        decimals: quote.outputDecimals, quantity: 0, costBasisUsd: 0, avgEntryUsd: 0,
        avgEntryMarketCap: 0, marketCapAtFirstBuy: 0, marketCapAtLastBuy: 0,
        realizedPnlUsd: 0, openedAt: Date.now(), lastPriceUsd: n(quote.token.priceUsd), lastMarketCap: n(quote.marketCapAtQuote)
      };
      const addedQty = quote.fillOutputUi;
      const addedCostUsd = quote.inUsdValue + gasUsd;
      const previousQty = old.quantity;
      const entryMarketCap = n(quote.marketCapAtQuote, n(quote.token.marketCap));
      const totalQty = previousQty + addedQty;
      old.avgEntryMarketCap = entryMarketCap > 0
        ? ((n(old.avgEntryMarketCap) * previousQty) + (entryMarketCap * addedQty)) / Math.max(totalQty, 1e-18)
        : n(old.avgEntryMarketCap);
      if (!old.marketCapAtFirstBuy && entryMarketCap > 0) old.marketCapAtFirstBuy = entryMarketCap;
      if (entryMarketCap > 0) {
        old.marketCapAtLastBuy = entryMarketCap;
        old.lastMarketCap = entryMarketCap;
      }
      old.quantity = totalQty;
      old.costBasisUsd += addedCostUsd;
      old.avgEntryUsd = old.quantity > 0 ? old.costBasisUsd / old.quantity : 0;
      old.lastPriceUsd = quote.outUsdValue > 0 && quote.quotedOutputUi > 0 ? quote.outUsdValue / quote.quotedOutputUi : n(quote.token.priceUsd, old.lastPriceUsd);
      old.updatedAt = Date.now();
      account.positions[mint] = old;
      trade = {
        type: "BUY", tokenAddress: mint, symbol: old.symbol, quantity: addedQty,
        inputSol, inputUsd: quote.inUsdValue, proceedsUsd: 0, pnlUsd: 0,
        priceAtEntryUsd: old.lastPriceUsd,
        marketCapAtEntry: entryMarketCap,
        avgEntryMarketCapAfter: old.avgEntryMarketCap
      };
    } else if (quote.side === "sell") {
      const position = account.positions[quote.token.tokenAddress];
      const sellQty = Math.min(position.quantity, quote.inputUi);
      if (account.solBalance + 1e-12 < gasSol) throw new Error(`Cần tối thiểu ${gasSol.toFixed(6)} SOL ảo để trả gas bán.`);
      const beforeQty = position.quantity;
      const costRemoved = position.costBasisUsd * (sellQty / beforeQty);
      const outputSol = quote.fillOutputUi;
      const proceedsUsd = outputSol * quote.solPriceUsd - gasUsd;
      const pnlUsd = proceedsUsd - costRemoved;
      account.solBalance += outputSol - gasSol;
      position.quantity -= sellQty;
      position.costBasisUsd -= costRemoved;
      position.realizedPnlUsd = n(position.realizedPnlUsd) + pnlUsd;
      position.updatedAt = Date.now();
      if (position.quantity <= Math.max(1e-12, 1 / (10 ** position.decimals))) delete account.positions[position.tokenAddress];
      else {
        position.avgEntryUsd = position.costBasisUsd / position.quantity;
        account.positions[position.tokenAddress] = position;
      }
      account.realizedPnlUsd += pnlUsd;
      const liveToken = state.tokens.find(t => t.tokenAddress === position.tokenAddress);
      trade = {
        type: "SELL", tokenAddress: position.tokenAddress, symbol: position.symbol,
        quantity: sellQty, outputSol, proceedsUsd, pnlUsd, costBasisUsd: costRemoved,
        marketCapAtExit: n(liveToken?.marketCap, n(position.lastMarketCap)),
        avgEntryMarketCap: n(position.avgEntryMarketCap)
      };
    } else if (quote.side === "usd_to_sol") {
      const spendUsd = quote.inputUi;
      if (account.usdBalance + 1e-9 < spendUsd) throw new Error("Không đủ USD ảo");
      if (!quote.gas.sponsored && account.solBalance + 1e-12 < gasSol) throw new Error("Không đủ SOL ảo trả gas. Hãy reset với một phần vốn SOL lớn hơn.");
      account.usdBalance -= spendUsd;
      account.solBalance += quote.fillOutputUi - gasSol;
      trade = { type: "USD_TO_SOL", symbol: "SOL", quantity: quote.fillOutputUi, inputUsd: spendUsd, pnlUsd: 0 };
    } else if (quote.side === "sol_to_usd") {
      if (account.solBalance + 1e-12 < quote.inputUi + gasSol) throw new Error("Không đủ SOL ảo gồm cả gas");
      account.solBalance -= quote.inputUi + gasSol;
      account.usdBalance += quote.fillOutputUi;
      trade = { type: "SOL_TO_USD", symbol: "USDC", quantity: quote.inputUi, proceedsUsd: quote.fillOutputUi, pnlUsd: 0 };
    }

    account.feesPaidUsd += gasUsd;
    const record = {
      id: quote.id,
      clientOrderId: String(body.clientOrderId || ""),
      instant: Boolean(body.instant),
      createdAt: Date.now(),
      ...trade,
      quote: {
        quoteSource: quote.quoteSource, approximation: quote.approximation,
        router: quote.router, routes: quote.routes, fillMode: quote.fillMode,
        priceImpactPct: quote.priceImpactPct, slippageBps: quote.slippageBps, feeBps: quote.feeBps,
        platformFee: quote.platformFee, gas: quote.gas, quotedOutputUi: quote.quotedOutputUi,
        minimumOutputUi: quote.minimumOutputUi, fillOutputUi: quote.fillOutputUi,
        solPriceUsd: quote.solPriceUsd,
        marketCapAtQuote: quote.marketCapAtQuote,
        tokenPriceAtQuote: quote.tokenPriceAtQuote,
        marketDataAt: quote.marketDataAt
      }
    };
    account.trades.unshift(record);
    savePaperAccount(account);
    return { ok: true, trade: record, paper: await paperView() };
  });
}

async function depositPaperUsd(body) {
  return withPaperLock(async () => {
    const amount = Math.round(n(body.amount) * 100) / 100;
    if (!(amount > 0) || amount > 1_000_000) throw new Error("Số tiền nạp phải từ $0.01 đến $1,000,000");
    const account = await ensurePaperInitialized();
    account.usdBalance += amount;
    account.netDepositsUsd = n(account.netDepositsUsd, n(account.initialUsd)) + amount;
    account.totalDepositedUsd = n(account.totalDepositedUsd, n(account.initialUsd)) + amount;
    account.trades.unshift({
      id: `deposit-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      type: "DEPOSIT",
      symbol: "USD",
      amountUsd: amount,
      inputUsd: amount,
      pnlUsd: 0,
      note: String(body.note || "Nạp vốn paper").slice(0, 120),
      createdAt: Date.now()
    });
    savePaperAccount(account);
    return { ok: true, paper: await paperView() };
  });
}

async function createProfile(body) {
  const name = profileSafeName(body.name);
  const profile = createProfileRecord(name);
  await ensurePaperInitialized(true, n(body.initialUsd, CONFIG.paperStartUsd), n(body.solPct, CONFIG.paperStartSolPct));
  setWatchlist([]);
  setHiddenMemes([]);
  return {
    ok: true,
    profile,
    profiles: publicProfiles(),
    paper: await paperView(),
    watchlist: [],
    hiddenMemes: []
  };
}

async function switchProfile(body) {
  const profile = setActiveProfile(body.id || body.code);
  await ensurePaperInitialized();
  return {
    ok: true,
    profile,
    profiles: publicProfiles(),
    paper: await paperView(),
    watchlist: getWatchlist(),
    hiddenMemes: getHiddenMemes()
  };
}


function safeWalletAddress(wallet) {
  const value = String(wallet || "").trim();
  if (!isSolanaPublicKey(value)) throw new Error("Địa chỉ ví Phantom không hợp lệ");
  return value;
}

function realLedgerFile(wallet) {
  return path.join(REAL_DIR, `${safeWalletAddress(wallet)}.json`);
}

function defaultRealLedger(wallet) {
  return {
    version: 1,
    wallet,
    positions: {},
    trades: [],
    realizedPnlUsd: 0,
    feesPaidUsd: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function loadRealLedger(wallet) {
  wallet = safeWalletAddress(wallet);
  try {
    const parsed = JSON.parse(fs.readFileSync(realLedgerFile(wallet), "utf8"));
    return {
      ...defaultRealLedger(wallet),
      ...parsed,
      wallet,
      positions: parsed.positions || {},
      trades: Array.isArray(parsed.trades) ? parsed.trades : []
    };
  } catch {
    return defaultRealLedger(wallet);
  }
}

function saveRealLedger(ledger) {
  ledger.wallet = safeWalletAddress(ledger.wallet);
  ledger.updatedAt = Date.now();
  ledger.trades = (ledger.trades || []).slice(0, CONFIG.paperHistoryLimit);
  const file = realLedgerFile(ledger.wallet);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(ledger, null, 2));
  fs.renameSync(temp, file);
}

function withRealWalletLock(wallet, task) {
  wallet = safeWalletAddress(wallet);
  const prior = realWalletLocks.get(wallet) || Promise.resolve();
  const run = prior.then(task, task);
  realWalletLocks.set(wallet, run.catch(() => {}));
  return run;
}

function jupiterHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...(CONFIG.jupiterApiKey ? { "x-api-key": CONFIG.jupiterApiKey } : {}),
    ...extra
  };
}

function rawAmountFromResult(value, fallback) {
  if (value == null) return String(fallback || "0");
  if (typeof value === "object") {
    return String(value.amount ?? value.value ?? value.rawAmount ?? fallback ?? "0");
  }
  return String(value);
}

async function walletTokenAccounts(wallet) {
  wallet = safeWalletAddress(wallet);
  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const responses = await Promise.allSettled(programs.map(programId =>
    rpc("getTokenAccountsByOwner", [
      wallet,
      { programId },
      { encoding: "jsonParsed", commitment: "confirmed" }
    ])
  ));

  const tokens = new Map();
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const item of response.value?.value || []) {
      const info = item?.account?.data?.parsed?.info;
      const amount = info?.tokenAmount;
      const mint = String(info?.mint || "");
      if (!mint || !amount) continue;
      const raw = BigInt(String(amount.amount || "0"));
      if (raw <= 0n) continue;
      const decimals = Number(amount.decimals || 0);
      const existing = tokens.get(mint) || { mint, raw: 0n, decimals, quantity: 0 };
      existing.raw += raw;
      existing.decimals = decimals;
      tokens.set(mint, existing);
    }
  }

  for (const token of tokens.values()) {
    token.quantity = rawToUi(token.raw.toString(), token.decimals);
    token.raw = token.raw.toString();
  }
  return tokens;
}

async function realWalletBalances(wallet) {
  wallet = safeWalletAddress(wallet);
  const [balanceResult, tokenMap] = await Promise.all([
    rpc("getBalance", [wallet, { commitment: "confirmed" }]),
    walletTokenAccounts(wallet)
  ]);
  const lamports = n(balanceResult?.value);
  return {
    wallet,
    lamports,
    solBalance: lamports / LAMPORTS_PER_SOL,
    tokens: tokenMap
  };
}


async function realQuickBalance(wallet) {
  wallet = safeWalletAddress(wallet);

  // The native balance is the only required request. Market prices and USDC are optional.
  const balanceResult = await rpc("getBalance", [wallet, { commitment: "confirmed" }]);
  const lamports = n(balanceResult?.value);
  const solBalance = lamports / LAMPORTS_PER_SOL;

  let solPriceUsd = 0;
  let priceError = null;
  try {
    solPriceUsd = await getSolPriceUsd();
  } catch (error) {
    priceError = String(error.message || error);
  }

  let usdcBalance = 0;
  let usdcError = null;
  try {
    const usdcAccounts = await rpc("getTokenAccountsByOwner", [
      wallet,
      { mint: USDC_MINT },
      { encoding: "jsonParsed", commitment: "confirmed" }
    ]);
    for (const item of usdcAccounts?.value || []) {
      usdcBalance += n(item?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString,
        n(item?.account?.data?.parsed?.info?.tokenAmount?.uiAmount));
    }
  } catch (error) {
    usdcError = String(error.message || error);
  }

  return {
    ok: true,
    mode: "real",
    wallet,
    lamports,
    solBalance,
    usdcBalance,
    solPriceUsd,
    solValueUsd: solPriceUsd > 0 ? solBalance * solPriceUsd : null,
    priceAvailable: solPriceUsd > 0,
    priceError,
    usdcError,
    rpcEndpoint: rpcEndpointLabel(activeRpcUrl),
    rpcFallbackCount: lastRpcFailures.length,
    lowBalanceWarning: solBalance > 0 && solBalance < 0.0025
      ? "Đã đọc được SOL, nhưng số dư này có thể chưa đủ để tạo token account mới và trả priority fee."
      : null,
    updatedAt: Date.now(),
    version: CONFIG.appVersion
  };
}

async function realPortfolio(wallet) {
  wallet = safeWalletAddress(wallet);
  const balances = await realWalletBalances(wallet);
  let solPriceUsd = 0;
  let marketPriceError = null;
  try { solPriceUsd = await getSolPriceUsd(); }
  catch (error) { marketPriceError = String(error.message || error); }

  const ledger = loadRealLedger(wallet);
  const mints = [...balances.tokens.keys()].filter(mint => mint !== USDC_MINT && mint !== SOL_MINT);
  for (const mint of mints) realTrackedMints.add(mint);
  scheduleBirdeyeResubscribe();
  let marketUpdates = new Map();
  if (mints.length) {
    try { marketUpdates = await fetchFastMarket(mints.slice(0, 120)); }
    catch (error) { marketPriceError = marketPriceError || String(error.message || error); }
  }
  const positions = [];

  for (const mint of mints) {
    const tokenBalance = balances.tokens.get(mint);
    const tracked = ledger.positions[mint] || {};
    const live = state.tokens.find(token => token.tokenAddress === mint)
      || marketUpdates.get(mint)
      || {};
    realtimeTokenMeta.set(mint, {
      tokenAddress: mint,
      symbol: String(live.symbol || tracked.symbol || `${mint.slice(0, 4)}…${mint.slice(-4)}`),
      name: String(live.name || tracked.name || "Token SPL"),
      dexId: String(live.dexId || tracked.dexId || "Solana"),
      pairAddress: String(live.pairAddress || tracked.pairAddress || ""),
      quoteSymbol: String(live.quoteSymbol || "SOL"),
      priceUsd: n(live.priceUsd, n(tracked.lastPriceUsd)),
      marketCap: n(live.marketCap, n(tracked.lastMarketCap))
    });
    const quantity = n(tokenBalance.quantity);
    const priceUsd = n(live.priceUsd, n(tracked.lastPriceUsd));
    const currentMarketCap = n(live.marketCap, n(tracked.lastMarketCap));
    const marketValueUsd = quantity * priceUsd;
    const costBasisUsd = n(tracked.costBasisUsd);
    const unrealizedPnlUsd = costBasisUsd > 0 ? marketValueUsd - costBasisUsd : 0;
    const entryMarketCap = n(tracked.avgEntryMarketCap, n(tracked.marketCapAtFirstBuy));

    positions.push({
      tokenAddress: mint,
      symbol: String(live.symbol || tracked.symbol || `${mint.slice(0, 4)}…${mint.slice(-4)}`),
      name: String(live.name || tracked.name || "Token SPL"),
      decimals: tokenBalance.decimals,
      quantity,
      rawAmount: tokenBalance.raw,
      priceUsd,
      currentMarketCap,
      entryMarketCap,
      marketCapChangePct: entryMarketCap > 0 ? (currentMarketCap - entryMarketCap) / entryMarketCap * 100 : 0,
      marketValueUsd,
      costBasisUsd,
      avgEntryUsd: n(tracked.avgEntryUsd),
      unrealizedPnlUsd,
      realizedPnlUsd: n(tracked.realizedPnlUsd),
      pnlPct: costBasisUsd > 0 ? unrealizedPnlUsd / costBasisUsd * 100 : 0,
      trackedByApp: costBasisUsd > 0,
      liveUpdatedAt: n(live.liveUpdatedAt, Date.now()),
      marketSource: live.marketSource || "DEX REST",
      marketSourceAt: n(live.marketSourceAt, n(live.liveUpdatedAt, Date.now())),
      marketReceivedAt: n(live.marketReceivedAt, Date.now())
    });
  }

  positions.sort((a, b) => b.marketValueUsd - a.marketValueUsd);
  const usdc = balances.tokens.get(USDC_MINT);
  const usdBalance = n(usdc?.quantity);
  const positionsValueUsd = positions.reduce((sum, p) => sum + p.marketValueUsd, 0);
  const equityUsd = balances.solBalance * solPriceUsd + usdBalance + positionsValueUsd;
  const unrealizedPnlUsd = positions.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0);
  const trackedCost = positions.reduce((sum, p) => sum + n(p.costBasisUsd), 0);
  const totalPnlUsd = n(ledger.realizedPnlUsd) + unrealizedPnlUsd;

  return {
    mode: "real",
    wallet,
    account: {
      wallet,
      usdBalance,
      solBalance: balances.solBalance,
      positions,
      trades: ledger.trades || [],
      realizedPnlUsd: n(ledger.realizedPnlUsd),
      feesPaidUsd: n(ledger.feesPaidUsd)
    },
    summary: {
      solPriceUsd,
      positionsValueUsd,
      equityUsd,
      totalPnlUsd,
      totalPnlPct: trackedCost > 0 ? totalPnlUsd / trackedCost * 100 : 0,
      unrealizedPnlUsd,
      realizedPnlUsd: n(ledger.realizedPnlUsd),
      feesPaidUsd: n(ledger.feesPaidUsd),
      analytics: pnlAnalytics(ledger)
    },
    config: {
      version: CONFIG.appVersion,
      walletPollMs: CONFIG.realWalletPollMs,
      jupiterMode: CONFIG.jupiterApiKey ? "api-key" : "keyless",
      realTrading: true,
      minSolReserve: CONFIG.realMinSolReserve
    },
    rpcEndpoint: rpcEndpointLabel(activeRpcUrl),
    marketPriceError,
    updatedAt: Date.now()
  };
}


function realOrderError(appCode, message, details = {}, httpStatus = 400) {
  const error = new Error(message);
  error.appCode = appCode;
  error.details = details;
  error.httpStatus = httpStatus;
  return error;
}

async function getStrictMintInfo(mint) {
  mint = safeWalletAddress(mint);
  const account = await rpc("getAccountInfo", [
    mint,
    { encoding: "jsonParsed", commitment: "confirmed" }
  ]);
  const value = account?.value;
  if (!value) {
    throw realOrderError(
      "TOKEN_MINT_NOT_FOUND",
      "Contract không tồn tại trên Solana mainnet.",
      { tokenAddress: mint },
      400
    );
  }
  const owner = String(value.owner || "");
  const parsed = value?.data?.parsed;
  const parsedType = String(parsed?.type || "");
  const decimals = parsed?.info?.decimals;
  if (![TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].includes(owner) || parsedType !== "mint" || !Number.isInteger(decimals)) {
    throw realOrderError(
      "TOKEN_ADDRESS_NOT_MINT",
      "Địa chỉ đang chọn không phải mint token SPL. Có thể scanner đã nhận nhầm pool/pair address.",
      { tokenAddress: mint, owner, parsedType },
      400
    );
  }
  tokenDecimalsCache.set(mint, decimals);
  return { mint, owner, decimals, tokenProgram: owner };
}

function jupiterErrorMessage(error) {
  const body = error?.responseBody;
  if (body && typeof body === "object") {
    return String(body.errorMessage || body.error || body.message || error.message || "Jupiter error");
  }
  return String(error?.message || error || "Jupiter error");
}

function isJupiterNoQuoteError(error) {
  const message = jupiterErrorMessage(error);
  return Number(error?.statusCode) === 400 && /failed to get quotes|no routes? found|no route|could not find any route/i.test(message);
}

async function requestRealJupiterOrder({ inputMint, outputMint, amountRaw, wallet, slippageBps, forceFixed = false }) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountRaw),
    taker: wallet
  });
  const useFixed = forceFixed || CONFIG.realSlippageMode === "fixed";
  if (useFixed && Number(slippageBps) > 0) {
    params.set("slippageBps", String(Math.min(10_000, Math.max(1, Math.round(slippageBps)))));
  }
  const url = `${CONFIG.jupiterBaseUrl}/order?${params}`;
  try {
    const order = await fetchJson(url, {
      headers: CONFIG.jupiterApiKey ? { "x-api-key": CONFIG.jupiterApiKey } : {}
    });
    return {
      order,
      requestUrl: url,
      quoteMode: useFixed ? "fixed-slippage" : "rtse-auto",
      requestParams: Object.fromEntries(params.entries())
    };
  } catch (error) {
    error.jupiterRequest = {
      quoteMode: useFixed ? "fixed-slippage" : "rtse-auto",
      params: Object.fromEntries(params.entries())
    };
    throw error;
  }
}

async function probeJupiterRoute({ inputMint, outputMint, amountRaw }) {
  const params = new URLSearchParams({ inputMint, outputMint, amount: String(amountRaw) });
  const url = `${CONFIG.jupiterBaseUrl}/order?${params}`;
  try {
    const order = await fetchJson(url, {
      headers: CONFIG.jupiterApiKey ? { "x-api-key": CONFIG.jupiterApiKey } : {}
    });
    return {
      ok: Boolean(order?.outAmount && BigInt(String(order.outAmount)) > 0n),
      outAmount: order?.outAmount || null,
      router: order?.router || null,
      errorCode: order?.errorCode || null,
      errorMessage: order?.errorMessage || null
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: error.statusCode || null,
      message: jupiterErrorMessage(error)
    };
  }
}


function parseGaslessMinimumUsd(message) {
  const match = String(message || "").match(/minimum\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:for\s+)?gasless/i);
  return match ? n(match[1], CONFIG.realGaslessDefaultMinUsd) : CONFIG.realGaslessDefaultMinUsd;
}

function isGaslessMinimumOrder(order) {
  const router = String(order?.router || "").toLowerCase();
  const code = Number(order?.errorCode || 0);
  const message = String(order?.errorMessage || order?.error || "");
  const aggregator = ["metis", "dflow", "okx", "aggregator", "unknown", ""].includes(router);
  return (aggregator && code === 3) || /minimum.*gasless|below minimum.*gasless|swap below minimum for gasless/i.test(message);
}

async function walletHasTokenAccountForMint(wallet, mint) {
  try {
    const result = await rpc("getTokenAccountsByOwner", [
      wallet,
      { mint },
      { encoding: "base64", commitment: "confirmed" }
    ]);
    return Boolean(result?.value?.length);
  } catch {
    return false;
  }
}

async function getTokenAccountRentLamports() {
  try {
    const value = await rpc("getMinimumBalanceForRentExemption", [
      CONFIG.realTokenAccountSize,
      { commitment: "confirmed" }
    ]);
    return Math.max(0, n(value, CONFIG.paperAtaRentLamports));
  } catch {
    return CONFIG.paperAtaRentLamports;
  }
}

async function estimateRealSelfPayGas({
  wallet,
  side,
  tokenAddress,
  amountUi,
  availableSol,
  solPriceUsd,
  gaslessMessage
}) {
  const isBuy = side === "buy";
  const outputAtaExists = isBuy
    ? await walletHasTokenAccountForMint(wallet, tokenAddress)
    : true;
  const tokenAccountRentLamports = await getTokenAccountRentLamports();

  // Missing destination ATA remains on-chain after a successful buy.
  const outputAtaRentLamports = isBuy && !outputAtaExists
    ? tokenAccountRentLamports
    : 0;

  // Jupiter wrapAndUnwrapSol=true creates a temporary WSOL token account and
  // closes it at the end. The rent is refunded, but the wallet must have these
  // lamports available up-front while the transaction is executing.
  const wsolUpfrontRentLamports = CONFIG.realIncludeWsolUpfrontRent
    ? tokenAccountRentLamports
    : 0;

  const signatureLamports = CONFIG.paperBaseFeeLamports;
  const priorityLamports = CONFIG.realV1MaxPriorityLamports;
  const safetyBufferLamports = CONFIG.realSelfPaySafetyBufferLamports;

  const nonRefundableEstimatedLamports =
    signatureLamports + priorityLamports + outputAtaRentLamports;
  const upfrontOnlyLamports = wsolUpfrontRentLamports + safetyBufferLamports;
  const totalUpfrontLamports =
    nonRefundableEstimatedLamports + upfrontOnlyLamports;

  const buyAmountSol = isBuy ? n(amountUi) : 0;
  const requiredSelfPaySol =
    buyAmountSol +
    totalUpfrontLamports / LAMPORTS_PER_SOL +
    CONFIG.realMinSolReserve;
  const shortfallSol = Math.max(0, requiredSelfPaySol - availableSol);
  const gaslessMinimumUsd = parseGaslessMinimumUsd(gaslessMessage);
  const tradeValueUsd = isBuy ? buyAmountSol * n(solPriceUsd) : 0;
  const gaslessMinimumSol = n(solPriceUsd) > 0
    ? gaslessMinimumUsd / solPriceUsd
    : 0;

  return {
    ataExists: outputAtaExists,
    outputAtaExists,
    tokenAccountRentLamports,
    ataRentLamports: outputAtaRentLamports,
    ataRentSol: outputAtaRentLamports / LAMPORTS_PER_SOL,
    outputAtaRentLamports,
    outputAtaRentSol: outputAtaRentLamports / LAMPORTS_PER_SOL,
    wsolUpfrontRentLamports,
    wsolUpfrontRentSol: wsolUpfrontRentLamports / LAMPORTS_PER_SOL,
    wsolRentRefundable: wsolUpfrontRentLamports > 0,
    signatureLamports,
    priorityLamports,
    safetyBufferLamports,
    safetyBufferSol: safetyBufferLamports / LAMPORTS_PER_SOL,
    estimatedFeeLamports: nonRefundableEstimatedLamports,
    estimatedFeeSol: nonRefundableEstimatedLamports / LAMPORTS_PER_SOL,
    totalUpfrontLamports,
    totalUpfrontSol: totalUpfrontLamports / LAMPORTS_PER_SOL,
    reserveSol: CONFIG.realMinSolReserve,
    availableSol,
    buyAmountSol,
    requiredSelfPaySol,
    shortfallSol,
    canSelfPay: availableSol + 1e-12 >= requiredSelfPaySol,
    gaslessMinimumUsd,
    gaslessMinimumSol,
    tradeValueUsd,
    solPriceUsd
  };
}

async function requestMetisV1SelfPayOrder({
  inputMint,
  outputMint,
  amountRaw,
  wallet,
  slippageBps,
  gasContext
}) {
  const appliedSlippage = Math.max(1, Math.min(10_000, Math.round(n(slippageBps, 100))));
  const quoteParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountRaw),
    swapMode: "ExactIn",
    slippageBps: String(appliedSlippage),
    restrictIntermediateTokens: "true"
  });
  const headers = CONFIG.jupiterApiKey ? { "x-api-key": CONFIG.jupiterApiKey } : {};
  const quote = await fetchJson(`${CONFIG.jupiterV1BaseUrl}/quote?${quoteParams}`, { headers });

  if (quote?.error || !quote?.outAmount || !/^\d+$/.test(String(quote.outAmount))) {
    throw new Error(String(quote?.error || quote?.errorMessage || "Metis V1 không tìm được quote self-pay"));
  }

  const body = JSON.stringify({
    userPublicKey: wallet,
    quoteResponse: quote,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        priorityLevel: "high",
        maxLamports: CONFIG.realV1MaxPriorityLamports
      }
    }
  });
  const swap = await fetchJson(`${CONFIG.jupiterV1BaseUrl}/swap`, {
    method: "POST",
    body,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body))
    },
    timeoutMs: Math.max(CONFIG.timeoutMs, 30_000)
  });

  if (swap?.error) {
    const error = new Error(String(swap.error));
    error.swapBuildError = swap.error;
    throw error;
  }

  if (swap?.simulationError) {
    const error = new Error(
      `Jupiter đã mô phỏng và transaction self-pay thất bại: ${JSON.stringify(swap.simulationError)}`
    );
    error.swapSimulationError = swap.simulationError;
    error.swapResponse = {
      prioritizationFeeLamports: swap.prioritizationFeeLamports ?? null,
      computeUnitLimit: swap.computeUnitLimit ?? null,
      dynamicSlippageReport: swap.dynamicSlippageReport ?? null
    };
    throw error;
  }

  if (!swap?.swapTransaction) {
    throw new Error("Metis V1 không build được transaction self-pay");
  }

  const requestId = `selfpay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const priorityLamports = n(swap.prioritizationFeeLamports, CONFIG.realV1MaxPriorityLamports);
  return {
    order: {
      transaction: swap.swapTransaction,
      requestId,
      inAmount: String(quote.inAmount || amountRaw),
      outAmount: String(quote.outAmount),
      otherAmountThreshold: String(quote.otherAmountThreshold || quote.outAmount),
      priceImpactPct: quote.priceImpactPct,
      slippageBps: quote.slippageBps,
      routePlan: quote.routePlan || [],
      router: "metis-v1",
      mode: "self-pay",
      gasless: false,
      signatureFeePayer: wallet,
      signatureFeeLamports: CONFIG.paperBaseFeeLamports,
      prioritizationFeeLamports: priorityLamports,
      rentFeeLamports: gasContext.outputAtaRentLamports + gasContext.wsolUpfrontRentLamports,
      outputAtaRentLamports: gasContext.outputAtaRentLamports,
      wsolUpfrontRentLamports: gasContext.wsolUpfrontRentLamports,
      refundableRentLamports: gasContext.wsolUpfrontRentLamports,
      safetyBufferLamports: gasContext.safetyBufferLamports,
      feeBps: n(quote.platformFee?.feeBps),
      platformFee: quote.platformFee || null,
      lastValidBlockHeight: swap.lastValidBlockHeight || null,
      quoteSource: "Jupiter Metis V1 self-pay",
      executionMode: "rpc-self-pay"
    },
    requestUrl: `${CONFIG.jupiterV1BaseUrl}/quote`,
    quoteMode: "metis-v1-self-pay",
    requestParams: Object.fromEntries(quoteParams.entries()),
    gasContext
  };
}

async function waitForSignatureConfirmation(signature, timeoutMs = 35_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await rpc("getSignatureStatuses", [
      [signature],
      { searchTransactionHistory: true }
    ]);
    const status = result?.value?.[0];
    if (status?.err) {
      throw new Error(`Transaction thất bại on-chain: ${JSON.stringify(status.err)}`);
    }
    if (status && ["confirmed", "finalized"].includes(status.confirmationStatus)) {
      return status;
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  throw new Error("Đã gửi transaction nhưng chưa xác nhận trong 35 giây. Kiểm tra chữ ký trên Solscan.");
}


function compactSimulationError(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); }
  catch { return String(err); }
}

function simulationInstructionIndex(err) {
  const instructionError = err?.InstructionError;
  return Array.isArray(instructionError) ? Number(instructionError[0]) : null;
}

function lastFailedProgram(logs) {
  for (let index = logs.length - 1; index >= 0; index--) {
    const match = String(logs[index]).match(/^Program\s+([1-9A-HJ-NP-Za-km-z]+)\s+failed:/);
    if (match) return match[1];
  }
  return null;
}

function classifySelfPaySimulation({ simulation, pending, availableLamports }) {
  const value = simulation?.value || simulation || {};
  const logs = Array.isArray(value.logs) ? value.logs : [];
  const joined = logs.join("\n");
  const lower = joined.toLowerCase();
  const instructionIndex = simulationInstructionIndex(value.err);
  const failedProgram = lastFailedProgram(logs);

  const transferMatch =
    joined.match(/insufficient lamports\s+(\d+),\s*need\s+(\d+)/i) ||
    joined.match(/insufficient lamports\s+(\d+)\s+for\s+(\d+)/i);
  const customOne = /custom program error:\s*0x1\b/i.test(joined)
    || /Custom["']?\s*,?\s*1/.test(compactSimulationError(value.err) || "");
  const tokenInsufficient =
    lower.includes("insufficient funds") &&
    (lower.includes(TOKEN_PROGRAM_ID.toLowerCase()) ||
     lower.includes(TOKEN_2022_PROGRAM_ID.toLowerCase()) ||
     pending.side === "sell");

  const details = {
    simulationError: value.err || null,
    simulationErrorText: compactSimulationError(value.err),
    instructionIndex,
    failedProgram,
    unitsConsumed: n(value.unitsConsumed),
    simulationFeeLamports: n(value.fee),
    availableLamports,
    availableSol: availableLamports / LAMPORTS_PER_SOL,
    logs: logs.slice(-CONFIG.realSimulationLogLimit),
    gasContext: pending.gasContext || null,
    orderFees: {
      signatureFeeLamports: n(pending.order?.signatureFeeLamports),
      prioritizationFeeLamports: n(pending.order?.prioritizationFeeLamports),
      outputAtaRentLamports: n(pending.order?.outputAtaRentLamports),
      wsolUpfrontRentLamports: n(pending.order?.wsolUpfrontRentLamports),
      refundableRentLamports: n(pending.order?.refundableRentLamports)
    }
  };

  if (transferMatch) {
    const currentLamports = n(transferMatch[1]);
    const neededLamports = n(transferMatch[2]);
    const shortfallLamports = Math.max(0, neededLamports - currentLamports);
    return {
      code: "SELF_PAY_INSUFFICIENT_SOL",
      status: 400,
      message:
        `Transaction cần chuyển ${neededLamports / LAMPORTS_PER_SOL} SOL tại instruction ${instructionIndex ?? "?"}, ` +
        `nhưng account lúc đó chỉ còn ${currentLamports / LAMPORTS_PER_SOL} SOL. ` +
        `Thiếu ít nhất ${(shortfallLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL.`,
      details: { ...details, currentLamports, neededLamports, shortfallLamports }
    };
  }

  if (tokenInsufficient) {
    return {
      code: "SELF_PAY_INSUFFICIENT_TOKEN",
      status: 400,
      message:
        "Transaction bán nhiều token hơn số dư token khả dụng tại lúc mô phỏng. Hãy tải lại số dư và lấy quote mới.",
      details
    };
  }

  if (customOne && pending.side === "buy") {
    const required = n(pending.gasContext?.requiredSelfPaySol);
    const available = availableLamports / LAMPORTS_PER_SOL;
    const estimatedShortfall = Math.max(0, required - available);
    return {
      code: "SELF_PAY_INSUFFICIENT_SOL",
      status: 400,
      message:
        `Simulation lỗi 0x1 tại instruction ${instructionIndex ?? "?"}; trong lệnh mua SOL, lỗi này thường là ` +
        `không đủ lamports cho tiền mua, phí hoặc rent tạm của Wrapped SOL. ` +
        `Ví có ${available.toFixed(6)} SOL` +
        (required > 0 ? `, mức an toàn ước tính cần ${required.toFixed(6)} SOL` : "") +
        (estimatedShortfall > 0 ? `, thiếu khoảng ${estimatedShortfall.toFixed(6)} SOL.` : "."),
      details: { ...details, estimatedRequiredSol: required, estimatedShortfallSol: estimatedShortfall }
    };
  }

  return {
    code: "SELF_PAY_SIMULATION_FAILED",
    status: 400,
    message:
      `Transaction self-pay không vượt qua mô phỏng tại instruction ${instructionIndex ?? "?"}` +
      (failedProgram ? ` của program ${failedProgram}` : "") +
      `. Không gửi transaction để tránh mất phí.`,
    details
  };
}

async function simulateSignedSelfPayTransaction(signedTransaction) {
  return rpc("simulateTransaction", [
    signedTransaction,
    {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: true,
      innerInstructions: true
    }
  ]);
}

async function sendRealSelfPayTransaction(body) {
  const requestId = String(body.requestId || "");
  const signedTransaction = String(body.signedTransaction || "");
  const wallet = safeWalletAddress(body.wallet);
  const pending = realOrderCache.get(requestId);

  if (!pending) throw realOrderError("ORDER_EXPIRED", "Lệnh self-pay đã hết hạn. Bấm lại để lấy giá mới.", null, 400);
  if (pending.wallet !== wallet) throw realOrderError("WALLET_MISMATCH", "Ví ký không trùng với ví tạo lệnh", null, 400);
  if (pending.executionMode !== "rpc-self-pay") {
    throw realOrderError("WRONG_EXECUTION_MODE", "Lệnh này không phải self-pay RPC", null, 400);
  }
  if (!signedTransaction) throw realOrderError("MISSING_SIGNED_TX", "Thiếu transaction đã ký từ Phantom", null, 400);

  const latestBalance = await rpc("getBalance", [wallet, { commitment: "confirmed" }]);
  const availableLamports = n(latestBalance?.value);

  let simulation;
  try {
    simulation = await simulateSignedSelfPayTransaction(signedTransaction);
  } catch (error) {
    // Some providers return a JSON-RPC error directly rather than a result.value.err.
    if (isDeterministicTransactionRpcError(error, "simulateTransaction")) {
      const synthetic = {
        value: {
          err: error.rpcData?.err || error.rpcData || error.message,
          logs: error.rpcData?.logs || [],
          unitsConsumed: error.rpcData?.unitsConsumed || 0,
          fee: error.rpcData?.fee || 0
        }
      };
      const classified = classifySelfPaySimulation({
        simulation: synthetic,
        pending,
        availableLamports
      });
      throw realOrderError(classified.code, classified.message, classified.details, classified.status);
    }
    throw realOrderError(
      "SELF_PAY_SIMULATION_RPC_FAILED",
      `Không thể mô phỏng transaction trước khi gửi: ${error.message}`,
      {
        rpcCode: error.rpcCode || null,
        rpcEndpoint: rpcEndpointLabel(error.rpcEndpoint || activeRpcUrl),
        rpcFailures: error.rpcFailures || null
      },
      502
    );
  }

  if (simulation?.value?.err) {
    const classified = classifySelfPaySimulation({
      simulation,
      pending,
      availableLamports
    });
    throw realOrderError(classified.code, classified.message, classified.details, classified.status);
  }

  let signature;
  try {
    // We have already simulated this exact signed transaction successfully.
    // Avoid running the same preflight a second time.
    signature = await rpc("sendTransaction", [
      signedTransaction,
      {
        encoding: "base64",
        skipPreflight: true,
        preflightCommitment: "confirmed",
        maxRetries: 3
      }
    ]);
  } catch (error) {
    throw realOrderError(
      "SELF_PAY_SEND_FAILED",
      `Không gửi được transaction self-pay: ${error.message}`,
      {
        rpcCode: error.rpcCode || null,
        rpcEndpoint: rpcEndpointLabel(error.rpcEndpoint || activeRpcUrl),
        rpcData: error.rpcData || null,
        simulation: {
          feeLamports: n(simulation?.value?.fee),
          unitsConsumed: n(simulation?.value?.unitsConsumed)
        }
      },
      502
    );
  }

  await waitForSignatureConfirmation(signature);
  const execution = {
    status: "Success",
    code: 0,
    signature,
    totalInputAmount: pending.inputRaw,
    inputAmountResult: pending.inputRaw,
    outputAmountResult: pending.outputRaw,
    totalOutputAmount: pending.outputRaw
  };
  const trade = await withRealWalletLock(wallet, async () =>
    updateRealLedgerFromExecution(pending, execution)
  );
  realOrderCache.delete(requestId);

  return {
    ok: true,
    executionMode: "rpc-self-pay",
    simulation: {
      feeLamports: n(simulation?.value?.fee),
      unitsConsumed: n(simulation?.value?.unitsConsumed)
    },
    execution,
    trade,
    explorerUrl: `https://solscan.io/tx/${signature}`
  };
}

async function getRealJupiterOrder(body) {
  const wallet = safeWalletAddress(body.wallet);
  const side = String(body.side || "buy").toLowerCase();
  if (!["buy", "sell"].includes(side)) throw realOrderError("INVALID_SIDE", "Loại lệnh REAL không hợp lệ");

  const requestedSlippageBps = Math.max(0, Math.min(10_000, Math.round(n(body.slippageBps))));
  const tokenAddress = safeWalletAddress(body.tokenAddress);
  const [balances, mintInfo] = await Promise.all([
    realWalletBalances(wallet),
    getStrictMintInfo(tokenAddress)
  ]);

  let inputMint;
  let outputMint;
  let amountRaw;
  let inputDecimals;
  let outputDecimals;
  let amountUi;

  if (side === "buy") {
    amountUi = n(body.amountSol);
    if (!(amountUi > 0)) throw realOrderError("INVALID_AMOUNT", "Số SOL mua phải lớn hơn 0");
    if (balances.solBalance + 1e-12 < amountUi + CONFIG.realMinSolReserve) {
      throw realOrderError(
        "INSUFFICIENT_SOL",
        `Không đủ SOL thật. Có ${balances.solBalance.toFixed(6)} SOL, lệnh mua ${amountUi} SOL và cần giữ lại ít nhất ${CONFIG.realMinSolReserve} SOL cho phí.`,
        { availableSol: balances.solBalance, amountSol: amountUi, reserveSol: CONFIG.realMinSolReserve }
      );
    }
    inputMint = SOL_MINT;
    outputMint = tokenAddress;
    inputDecimals = 9;
    outputDecimals = mintInfo.decimals;
    amountRaw = uiToRaw(amountUi, inputDecimals);
  } else {
    const token = balances.tokens.get(tokenAddress);
    if (!token || BigInt(token.raw) <= 0n) {
      throw realOrderError("NO_TOKEN_BALANCE", "Phantom không có số dư token này");
    }
    const percent = Math.max(0.1, Math.min(100, n(body.percent, 100)));
    amountRaw = (BigInt(token.raw) * BigInt(Math.round(percent * 1000)) / 100_000n).toString();
    if (BigInt(amountRaw) <= 0n) throw realOrderError("AMOUNT_TOO_SMALL", "Số lượng bán quá nhỏ");
    inputMint = tokenAddress;
    outputMint = SOL_MINT;
    inputDecimals = token.decimals;
    outputDecimals = 9;
    amountUi = rawToUi(amountRaw, inputDecimals);
  }

  let orderResult;
  try {
    // RTSE/default mode intentionally omits slippageBps. This keeps all routers eligible.
    orderResult = await requestRealJupiterOrder({
      inputMint,
      outputMint,
      amountRaw,
      wallet,
      slippageBps: requestedSlippageBps
    });
  } catch (error) {
    if (isJupiterNoQuoteError(error)) {
      let routeProbe = null;
      if (CONFIG.realRouteDiagnostic) {
        const probeRaw = side === "buy"
          ? uiToRaw(Math.max(amountUi * 2, CONFIG.realRouteProbeSol), 9)
          : amountRaw;
        // Keyless is 0.5 RPS. Wait only on the error path before the diagnostic probe.
        await new Promise(resolve => setTimeout(resolve, CONFIG.jupiterApiKey ? 1100 : 2100));
        routeProbe = await probeJupiterRoute({ inputMint, outputMint, amountRaw: probeRaw });
      }
      const market = state.tokens.find(token => token.tokenAddress === tokenAddress) || {};
      const amountLabel = side === "buy" ? `${amountUi} SOL` : `${body.percent || 100}% vị thế`;
      const routeHint = routeProbe?.ok
        ? `Jupiter có route ở mức probe ${CONFIG.realRouteProbeSol} SOL; lệnh ${amountLabel} có thể quá nhỏ.`
        : "Jupiter hiện không có route thực thi cho mint này ở cả mức lệnh và mức probe.";
      throw realOrderError(
        "JUPITER_NO_ROUTE",
        `Jupiter không lấy được quote cho ${amountLabel}. ${routeHint}`,
        {
          tokenAddress,
          symbol: body.symbol || market.symbol || null,
          side,
          amountRaw: String(amountRaw),
          amountUi,
          requestedSlippageBps,
          actualQuoteMode: CONFIG.realSlippageMode === "fixed" ? "fixed-slippage" : "rtse-auto",
          jupiterMessage: jupiterErrorMessage(error),
          routeProbe,
          market: {
            dexId: market.dexId || body.dexId || null,
            liquidityUsd: n(market.liquidityUsd, n(body.liquidityUsd)),
            marketCap: n(market.marketCap, n(body.marketCap)),
            priceUsd: n(market.priceUsd, n(body.priceUsd))
          },
          gmgnUrl: `https://gmgn.ai/sol/token/${tokenAddress}`,
          dexUrl: market.pairAddress
            ? `https://dexscreener.com/solana/${market.pairAddress}`
            : `https://dexscreener.com/solana/${tokenAddress}`,
          possibleReasons: [
            "Pool chưa được Jupiter lập route hoặc bonding curve chưa được hỗ trợ tại thời điểm này",
            "Pool đã bị loại khỏi routing do thanh khoản/round-trip không đạt điều kiện",
            "Số tiền lệnh quá nhỏ so với route hiện có",
            "Token chỉ hiện trên nguồn scanner nhưng chưa thể swap qua Jupiter"
          ]
        },
        400
      );
    }
    if (Number(error.statusCode) === 429) {
      throw realOrderError(
        "JUPITER_RATE_LIMIT",
        "Jupiter đang giới hạn lượt gọi. Đợi khoảng 2 giây rồi bấm lại hoặc thêm JUPITER_API_KEY miễn phí.",
        { jupiterMessage: jupiterErrorMessage(error) },
        429
      );
    }
    throw realOrderError(
      "JUPITER_ORDER_HTTP_ERROR",
      `Jupiter /order lỗi: ${jupiterErrorMessage(error)}`,
      { statusCode: error.statusCode || null, request: error.jupiterRequest || null },
      error.statusCode || 502
    );
  }

  let order = orderResult.order;
  let gasContext = null;

  if (!order?.transaction && isGaslessMinimumOrder(order)) {
    const gaslessMessage = order?.errorMessage || order?.error || "Minimum for gasless";
    const solPriceUsd = await getSolPriceUsd();
    gasContext = await estimateRealSelfPayGas({
      wallet,
      side,
      tokenAddress,
      amountUi,
      availableSol: balances.solBalance,
      solPriceUsd,
      gaslessMessage
    });

    if (gasContext.canSelfPay && CONFIG.realSelfPayFallback) {
      try {
        orderResult = await requestMetisV1SelfPayOrder({
          inputMint,
          outputMint,
          amountRaw,
          wallet,
          slippageBps: requestedSlippageBps || 100,
          gasContext
        });
        order = orderResult.order;
      } catch (fallbackError) {
        throw realOrderError(
          "REAL_SELF_PAY_FALLBACK_FAILED",
          `Jupiter gasless không nhận lệnh nhỏ và luồng tự trả gas cũng thất bại: ${fallbackError.message}`,
          {
            originalGaslessMessage: gaslessMessage,
            gasContext,
            fallbackMessage: fallbackError.message
          },
          400
        );
      }
    } else {
      const missingAtaText = gasContext.outputAtaExists
        ? "Ví đã có token account nhận meme."
        : `Ví chưa có token account nhận meme; rent khoảng ${gasContext.outputAtaRentSol.toFixed(6)} SOL.`;
      const wsolText = gasContext.wsolUpfrontRentSol > 0
        ? ` Ngoài ra cần tạm ứng ${gasContext.wsolUpfrontRentSol.toFixed(6)} SOL để wrap SOL; khoản này được hoàn lại khi swap thành công.`
        : "";
      const topUpSuggestion = Math.max(gasContext.shortfallSol + 0.0002, 0);
      throw realOrderError(
        "JUPITER_GASLESS_MINIMUM",
        `Lệnh chỉ khoảng $${gasContext.tradeValueUsd.toFixed(2)}, thấp hơn mức gasless khoảng $${gasContext.gaslessMinimumUsd.toFixed(2)}. ` +
        `Ví có ${gasContext.availableSol.toFixed(6)} SOL nhưng tự trả cần khoảng ${gasContext.requiredSelfPaySol.toFixed(6)} SOL. ` +
        `${missingAtaText}${wsolText} Thiếu khoảng ${gasContext.shortfallSol.toFixed(6)} SOL.`,
        {
          ...gasContext,
          suggestedTopUpSol: topUpSuggestion,
          originalGaslessMessage: gaslessMessage,
          alternatives: [
            `Nạp thêm tối thiểu khoảng ${topUpSuggestion.toFixed(6)} SOL để tự trả gas/rent`,
            `Tăng giá trị lệnh lên tối thiểu khoảng $${gasContext.gaslessMinimumUsd.toFixed(2)} để thử gasless`,
            "Mua token đã có token account trong ví sẽ không cần trả lại ATA rent"
          ]
        },
        400
      );
    }
  }

  if (order?.error && !order.transaction) {
    throw realOrderError(
      "JUPITER_ORDER_REJECTED",
      String(order.error),
      { router: order.router, errorCode: order.errorCode, errorMessage: order.errorMessage }
    );
  }
  if (!order?.transaction || !order?.requestId) {
    const code = Number(order?.errorCode || 0);
    const router = String(order?.router || "unknown");
    const message = order?.errorMessage || "Jupiter có giá nhưng không tạo được transaction";
    throw realOrderError(
      "JUPITER_TRANSACTION_NOT_BUILT",
      `[${router}] ${message}`,
      { router, errorCode: code, errorMessage: message, outAmount: order?.outAmount || null }
    );
  }

  const signatureFeeLamports = n(order.signatureFeeLamports);
  const priorityFeeLamports = n(order.prioritizationFeeLamports);
  const rentFeeLamports = n(order.rentFeeLamports);
  const quotedFeeLamports = signatureFeeLamports + priorityFeeLamports + rentFeeLamports;
  const quotedFeeSol = quotedFeeLamports / LAMPORTS_PER_SOL;
  const minimumReserveSol = CONFIG.realMinSolReserve;
  const requiredSol = side === "buy"
    ? amountUi + quotedFeeSol + minimumReserveSol
    : quotedFeeSol + minimumReserveSol;

  if (balances.solBalance + 1e-12 < requiredSol) {
    const reason = rentFeeLamports > 0
      ? `Quote cần ${quotedFeeSol.toFixed(6)} SOL phí/rent; token này có thể cần tạo token account mới.`
      : `Quote cần khoảng ${quotedFeeSol.toFixed(6)} SOL phí mạng.`;
    throw realOrderError(
      "INSUFFICIENT_SOL_AFTER_QUOTE",
      `Không đủ SOL sau quote thật. Có ${balances.solBalance.toFixed(6)} SOL, cần khoảng ${requiredSol.toFixed(6)} SOL. ${reason}`,
      {
        availableSol: balances.solBalance,
        requiredSol,
        buyAmountSol: side === "buy" ? amountUi : 0,
        signatureFeeLamports,
        priorityFeeLamports,
        rentFeeLamports,
        reserveSol: minimumReserveSol
      }
    );
  }

  const market = await resolvePaperTokenMarket(tokenAddress, {
    tokenAddress,
    symbol: body.symbol,
    name: body.name,
    priceUsd: body.priceUsd,
    marketCap: body.marketCap,
    liquidityUsd: body.liquidityUsd
  });
  const pending = {
    requestId: order.requestId,
    wallet,
    side,
    tokenAddress,
    symbol: String(market.symbol || body.symbol || "TOKEN"),
    name: String(market.name || body.name || "Token"),
    inputMint,
    outputMint,
    inputDecimals,
    outputDecimals,
    inputRaw: String(order.inAmount || amountRaw),
    outputRaw: String(order.outAmount || "0"),
    amountUi,
    solPriceUsd: await getSolPriceUsd(),
    tokenPriceUsd: n(market.priceUsd),
    marketCapAtQuote: n(market.marketCap),
    liquidityUsd: n(market.liquidityUsd),
    createdAt: Date.now(),
    order,
    executionMode: order.executionMode || "jupiter-v2-execute",
    gasContext: orderResult.gasContext || gasContext || null,
    quoteMode: orderResult.quoteMode
  };
  realOrderCache.set(order.requestId, pending);
  setTimeout(() => realOrderCache.delete(order.requestId), CONFIG.realOrderTtlMs + 5_000).unref?.();

  return {
    ok: true,
    version: CONFIG.appVersion,
    requestId: order.requestId,
    transaction: order.transaction,
    executionMode: order.executionMode || "jupiter-v2-execute",
    expiresAt: pending.createdAt + CONFIG.realOrderTtlMs,
    quote: {
      side,
      tokenAddress,
      symbol: pending.symbol,
      inputMint,
      outputMint,
      inputUi: rawToUi(pending.inputRaw, inputDecimals),
      outputUi: rawToUi(pending.outputRaw, outputDecimals),
      inputDecimals,
      outputDecimals,
      inUsdValue: n(order.inUsdValue),
      outUsdValue: n(order.outUsdValue),
      priceImpactPct: n(order.priceImpact, n(order.priceImpactPct) * 100),
      slippageBps: n(order.slippageBps, requestedSlippageBps),
      slippageMode: orderResult.quoteMode,
      quoteSource: order.quoteSource || "Jupiter V2",
      executionMode: order.executionMode || "jupiter-v2-execute",
      gasless: Boolean(order.gasless),
      signatureFeeLamports,
      prioritizationFeeLamports: priorityFeeLamports,
      rentFeeLamports,
      estimatedFeeSol: quotedFeeSol,
      requiredSol,
      availableSol: balances.solBalance,
      router: order.router || "Jupiter",
      marketCapAtQuote: pending.marketCapAtQuote
    }
  };
}

function updateRealLedgerFromExecution(pending, execution) {
  const ledger = loadRealLedger(pending.wallet);
  const now = Date.now();
  const gasLamports = n(pending.order.signatureFeeLamports)
    + n(pending.order.prioritizationFeeLamports)
    + n(pending.order.rentFeeLamports);
  const gasUsd = gasLamports / LAMPORTS_PER_SOL * pending.solPriceUsd;
  const actualInputRaw = rawAmountFromResult(
    execution.inputAmountResult ?? execution.totalInputAmount,
    pending.inputRaw
  );
  const actualOutputRaw = rawAmountFromResult(
    execution.outputAmountResult ?? execution.totalOutputAmount,
    pending.outputRaw
  );

  let trade;
  if (pending.side === "buy") {
    const inputSol = rawToUi(actualInputRaw, pending.inputDecimals);
    const quantity = rawToUi(actualOutputRaw, pending.outputDecimals);
    const position = ledger.positions[pending.tokenAddress] || {
      tokenAddress: pending.tokenAddress,
      symbol: pending.symbol,
      name: pending.name,
      decimals: pending.outputDecimals,
      quantityTracked: 0,
      costBasisUsd: 0,
      avgEntryUsd: 0,
      avgEntryMarketCap: 0,
      marketCapAtFirstBuy: 0,
      marketCapAtLastBuy: 0,
      realizedPnlUsd: 0,
      openedAt: now
    };
    const previousQty = n(position.quantityTracked);
    const totalQty = previousQty + quantity;
    const costUsd = inputSol * pending.solPriceUsd + gasUsd;
    const entryMc = n(pending.marketCapAtQuote);
    position.avgEntryMarketCap = entryMc > 0
      ? (n(position.avgEntryMarketCap) * previousQty + entryMc * quantity) / Math.max(totalQty, 1e-18)
      : n(position.avgEntryMarketCap);
    if (!position.marketCapAtFirstBuy && entryMc > 0) position.marketCapAtFirstBuy = entryMc;
    position.marketCapAtLastBuy = entryMc || n(position.marketCapAtLastBuy);
    position.quantityTracked = totalQty;
    position.costBasisUsd = n(position.costBasisUsd) + costUsd;
    position.avgEntryUsd = totalQty > 0 ? position.costBasisUsd / totalQty : 0;
    position.lastPriceUsd = pending.tokenPriceUsd;
    position.lastMarketCap = entryMc;
    position.updatedAt = now;
    ledger.positions[pending.tokenAddress] = position;
    trade = {
      mode: "REAL",
      type: "BUY",
      tokenAddress: pending.tokenAddress,
      symbol: pending.symbol,
      quantity,
      inputSol,
      inputUsd: inputSol * pending.solPriceUsd,
      priceAtEntryUsd: pending.tokenPriceUsd,
      marketCapAtEntry: entryMc,
      pnlUsd: 0
    };
  } else {
    const quantity = rawToUi(actualInputRaw, pending.inputDecimals);
    const outputSol = rawToUi(actualOutputRaw, pending.outputDecimals);
    const position = ledger.positions[pending.tokenAddress] || {};
    const trackedQty = Math.max(n(position.quantityTracked), quantity);
    const fraction = trackedQty > 0 ? Math.min(1, quantity / trackedQty) : 0;
    const costRemoved = n(position.costBasisUsd) * fraction;
    const proceedsUsd = outputSol * pending.solPriceUsd - gasUsd;
    const pnlUsd = costRemoved > 0 ? proceedsUsd - costRemoved : 0;
    position.quantityTracked = Math.max(0, n(position.quantityTracked) - quantity);
    position.costBasisUsd = Math.max(0, n(position.costBasisUsd) - costRemoved);
    position.realizedPnlUsd = n(position.realizedPnlUsd) + pnlUsd;
    position.avgEntryUsd = position.quantityTracked > 0 ? position.costBasisUsd / position.quantityTracked : 0;
    position.updatedAt = now;
    if (position.quantityTracked <= 1e-12) delete ledger.positions[pending.tokenAddress];
    else ledger.positions[pending.tokenAddress] = position;
    ledger.realizedPnlUsd += pnlUsd;
    trade = {
      mode: "REAL",
      type: "SELL",
      tokenAddress: pending.tokenAddress,
      symbol: pending.symbol,
      quantity,
      outputSol,
      proceedsUsd,
      costBasisUsd: costRemoved,
      pnlUsd,
      marketCapAtExit: pending.marketCapAtQuote,
      avgEntryMarketCap: n(position.avgEntryMarketCap)
    };
  }

  ledger.feesPaidUsd += gasUsd;
  trade.id = `real-${now}-${crypto.randomBytes(3).toString("hex")}`;
  trade.signature = execution.signature || null;
  trade.createdAt = now;
  trade.quote = {
    source: pending.executionMode === "rpc-self-pay"
      ? "Jupiter Metis V1 self-pay"
      : "Jupiter V2",
    requestId: pending.requestId,
    gasUsd,
    priceImpactPct: n(pending.order.priceImpact, n(pending.order.priceImpactPct) * 100),
    slippageBps: n(pending.order.slippageBps)
  };
  ledger.trades.unshift(trade);
  saveRealLedger(ledger);
  return trade;
}

async function executeRealJupiterOrder(body) {
  const requestId = String(body.requestId || "");
  const signedTransaction = String(body.signedTransaction || "");
  const wallet = safeWalletAddress(body.wallet);
  const pending = realOrderCache.get(requestId);
  if (!pending) throw new Error("Lệnh đã hết hạn. Bấm lại để lấy giá mới.");
  if (pending.wallet !== wallet) throw new Error("Ví ký không trùng với ví tạo lệnh");
  if (Date.now() - pending.createdAt > CONFIG.realOrderTtlMs) {
    realOrderCache.delete(requestId);
    throw new Error("Quote đã hết hạn. Bấm lại để lấy quote mới.");
  }
  if (!signedTransaction) throw new Error("Thiếu transaction đã ký từ Phantom");
  if (pending.executionMode === "rpc-self-pay") {
    throw new Error("Lệnh self-pay phải gửi qua /api/real/send-raw");
  }

  const payload = JSON.stringify({ signedTransaction, requestId });
  const execution = await fetchJson(`${CONFIG.jupiterBaseUrl}/execute`, {
    method: "POST",
    body: payload,
    headers: jupiterHeaders({ "Content-Length": Buffer.byteLength(payload) }),
    timeoutMs: Math.max(CONFIG.timeoutMs, 45_000)
  });

  if (execution?.status && String(execution.status).toLowerCase() !== "success") {
    throw new Error(execution.error || execution.code || `Jupiter execute: ${execution.status}`);
  }
  if (!execution?.signature) {
    throw new Error(execution?.error || "Jupiter chưa trả về chữ ký giao dịch");
  }

  const trade = await withRealWalletLock(wallet, async () =>
    updateRealLedgerFromExecution(pending, execution)
  );
  realOrderCache.delete(requestId);
  return {
    ok: true,
    execution,
    trade,
    explorerUrl: `https://solscan.io/tx/${execution.signature}`
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname === "/health" && req.method === "GET") {
    const writable = dataDirectoryWritable();
    return json(res, writable ? 200 : 503, {
      ok: writable,
      service: "solana-memecoin-trader",
      version: CONFIG.appVersion,
      uptimeSeconds: Math.round(process.uptime()),
      dataRoot: DATA_ROOT,
      dataWritable: writable,
      railway: Boolean(CONFIG.railwayEnvironment || process.env.RAILWAY_PROJECT_ID),
      environment: CONFIG.railwayEnvironment || "local",
      timestamp: Date.now()
    });
  }

  if (!isRequestAuthorized(req)) {
    return requestBasicAuth(res);
  }

  try {

    if (pathname === "/api/settings/quick-trade" && req.method === "GET") {
      return json(res, 200, { ok: true, settings: loadQuickTradeSettings(), dataFile: QUICK_TRADE_SETTINGS_FILE });
    }

    if (pathname === "/api/settings/quick-trade" && req.method === "POST") {
      try {
        const body = await readBody(req);
        return json(res, 200, { ok: true, settings: saveQuickTradeSettings(body) });
      } catch (error) {
        return json(res, 400, { error: error.message, code: "QUICK_SETTINGS_INVALID" });
      }
    }

    if (pathname === "/api/version" && req.method === "GET") {
      return json(res, 200, {
        version: CONFIG.appVersion,
        port: CONFIG.port,
        quoteMode: CONFIG.paperQuoteMode,
        jupiterConfigured: Boolean(CONFIG.jupiterApiKey),
        fastTickerMs: CONFIG.fastTickerMs,
        fastTickerEnabled: CONFIG.fastTickerEnabled,
        dataRoot: DATA_ROOT,
        activeProfile: activeProfile()
      });
    }

    if (pathname === "/api/state" && req.method === "GET") {
      return json(res, 200, publicState());
    }

    if (pathname === "/api/scan" && req.method === "POST") {
      performScan(true);
      return json(res, 202, { ok: true, message: "Đã bắt đầu quét" });
    }

    if (pathname === "/api/stream" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*"
      });
      res.write(`event: scan\ndata: ${JSON.stringify(publicState())}\n\n`);
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
      clients.add(res);
      req.on("close", () => {
        clearInterval(heartbeat);
        clients.delete(res);
      });
      return;
    }





    if (pathname === "/api/real/rpc-request-test" && req.method === "GET") {
      const id = nextRpcRequestId();
      const sample = {
        jsonrpc: "2.0",
        id,
        method: "getBalance",
        params: [
          String(url.searchParams.get("wallet") || "5Hm5ZxKaHVRZezks7MLMAp7D8ENtZQWRmRimj3Ls2KSM"),
          { commitment: "confirmed" }
        ]
      };
      const encoded = JSON.stringify(sample);
      return json(res, 200, {
        ok: true,
        sample,
        validJson: Boolean(JSON.parse(encoded)),
        idType: typeof id,
        idIsInteger: Number.isInteger(id),
        bytes: Buffer.byteLength(encoded),
        version: CONFIG.appVersion
      });
    }

    if (pathname === "/api/real/rpc-health" && req.method === "GET") {
      try {
        const health = await rpc("getHealth", []);
        return json(res, 200, {
          ok: true,
          health,
          activeRpc: rpcEndpointLabel(activeRpcUrl),
          configuredRpcs: CONFIG.rpcUrls.map(rpcEndpointLabel),
          previousFailures: lastRpcFailures,
          version: CONFIG.appVersion
        });
      } catch (error) {
        return json(res, 502, {
          ok: false,
          error: error.message,
          configuredRpcs: CONFIG.rpcUrls.map(rpcEndpointLabel),
          failures: error.rpcFailures || lastRpcFailures,
          version: CONFIG.appVersion
        });
      }
    }

    if (pathname === "/api/real/balance" && req.method === "GET") {
      try {
        return json(res, 200, await realQuickBalance(url.searchParams.get("wallet")));
      } catch (error) {
        const status = /không hợp lệ/i.test(error.message) ? 400 : /429/i.test(error.message) ? 429 : 502;
        return json(res, status, {
          error: error.message,
          code: "REAL_BALANCE_FAILED",
          rpcFailures: error.rpcFailures || lastRpcFailures,
          configuredRpcs: CONFIG.rpcUrls.map(rpcEndpointLabel),
          version: CONFIG.appVersion
        });
      }
    }

    if (pathname === "/api/real/portfolio" && req.method === "GET") {
      try {
        return json(res, 200, await realPortfolio(url.searchParams.get("wallet")));
      } catch (error) {
        const status = /không hợp lệ/i.test(error.message) ? 400 : /429/i.test(error.message) ? 429 : 502;
        return json(res, status, { error: error.message, code: "REAL_PORTFOLIO_FAILED", version: CONFIG.appVersion });
      }
    }

    if (pathname === "/api/real/order" && req.method === "POST") {
      const body = await readBody(req);
      try {
        return json(res, 200, await getRealJupiterOrder(body));
      } catch (error) {
        const status = Number(error.httpStatus) || (/429|Too many requests/i.test(error.message) ? 429 : 502);
        return json(res, status, {
          error: error.message,
          code: error.appCode || "REAL_ORDER_FAILED",
          details: error.details || null,
          version: CONFIG.appVersion
        });
      }
    }


    if (pathname === "/api/real/send-raw" && req.method === "POST") {
      const body = await readBody(req, 4_000_000);
      try {
        return json(res, 200, await sendRealSelfPayTransaction(body));
      } catch (error) {
        const status = Number(error.httpStatus) || 502;
        return json(res, status, {
          error: error.message,
          code: error.appCode || "SELF_PAY_SEND_FAILED",
          details: error.details || null,
          version: CONFIG.appVersion
        });
      }
    }

    if (pathname === "/api/real/execute" && req.method === "POST") {
      const body = await readBody(req, 4_000_000);
      try {
        return json(res, 200, await executeRealJupiterOrder(body));
      } catch (error) {
        const status = /hết hạn|không trùng|thiếu transaction/i.test(error.message) ? 400 : 502;
        return json(res, status, { error: error.message, code: "REAL_EXECUTE_FAILED", version: CONFIG.appVersion });
      }
    }

    if (pathname === "/api/profiles" && req.method === "GET") {
      return json(res, 200, publicProfiles());
    }

    if (pathname === "/api/profiles/create" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, 200, await createProfile(body));
    }

    if (pathname === "/api/profiles/switch" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, 200, await switchProfile(body));
    }

    if (pathname === "/api/profiles/rename" && req.method === "POST") {
      const body = await readBody(req);
      const profile = activeProfile();
      profile.name = profileSafeName(body.name);
      profile.updatedAt = Date.now();
      saveProfileStore(profileStore);
      return json(res, 200, { ok: true, profiles: publicProfiles(), paper: await paperView() });
    }

    if (pathname === "/api/paper" && req.method === "GET") {
      return json(res, 200, await paperView());
    }

    if (pathname === "/api/paper/deposit" && req.method === "POST") {
      const body = await readBody(req);
      try { return json(res, 200, await depositPaperUsd(body)); }
      catch (error) { return json(res, 400, { error: error.message, code: "DEPOSIT_FAILED" }); }
    }

    if (pathname === "/api/paper/reset" && req.method === "POST") {
      const body = await readBody(req);
      const account = await withPaperLock(() => ensurePaperInitialized(true, body.initialUsd, body.solPct));
      return json(res, 200, { ok: true, account, paper: await paperView() });
    }

    if (pathname === "/api/paper/quote" && req.method === "POST") {
      const body = await readBody(req);
      try {
        return json(res, 200, { ok: true, quote: await buildPaperQuote(body) });
      } catch (error) {
        const status = /mint không hợp lệ|Số lượng quote không hợp lệ|Thiếu địa chỉ token/i.test(error.message) ? 400
          : /429|giới hạn lượt gọi/i.test(error.message) ? 429
          : 502;
        const message = String(error.message || "Lỗi quote không xác định");
        return json(res, status, {
          error: message === "Parse error"
            ? "Nguồn quote trả Parse error. Bản v2.5 sẽ tự dùng DEX fallback; kiểm tra token còn giá/thanh khoản hay không."
            : message,
          code: "QUOTE_FAILED",
          version: CONFIG.appVersion
        });
      }
    }

    if (pathname === "/api/paper/instant" && req.method === "POST") {
      const body = await readBody(req);
      try {
        return json(res, 200, await executePaperTrade({ ...body, instant: true }));
      } catch (error) {
        const message = String(error.message || "Không thể khớp lệnh nhanh");
        const status = /không đủ|không có vị thế|không hợp lệ|thiếu địa chỉ/i.test(message) ? 400 : 502;
        return json(res, status, { error: message, code: "INSTANT_TRADE_FAILED", version: CONFIG.appVersion });
      }
    }

    if (pathname === "/api/paper/trade" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, 200, await executePaperTrade(body));
    }

    if (pathname === "/api/hidden-memes" && req.method === "GET") {
      return json(res, 200, {
        items: getHiddenMemes(),
        profileId: activeProfile().id,
        version: CONFIG.appVersion
      });
    }

    if (pathname === "/api/hidden-memes" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const result = updateHiddenMemes(body);
        return json(res, 200, {
          ok: true,
          ...result,
          profileId: activeProfile().id,
          version: CONFIG.appVersion
        });
      } catch (error) {
        return json(res, 400, {
          error: error.message,
          code: "HIDDEN_MEME_UPDATE_FAILED",
          version: CONFIG.appVersion
        });
      }
    }

    if (pathname === "/api/watchlist" && req.method === "GET") {
      return json(res, 200, { items: getWatchlist() });
    }

    if (pathname === "/api/watchlist" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.tokenAddress) return json(res, 400, { error: "Thiếu tokenAddress" });
      const items = getWatchlist();
      const index = items.findIndex(i => i.tokenAddress === body.tokenAddress);
      const item = {
        tokenAddress: String(body.tokenAddress),
        symbol: String(body.symbol || "???").slice(0, 18),
        name: String(body.name || "").slice(0, 80),
        addedAt: Date.now()
      };
      if (index >= 0) items.splice(index, 1);
      else items.unshift(item);
      setWatchlist(items);
      return json(res, 200, { items, watched: index < 0 });
    }

    if (pathname.startsWith("/api/")) {
      return json(res, 404, { error: "API không tồn tại" });
    }

    return serveStatic(req, res, pathname);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(CONFIG.port, CONFIG.host, () => {
  const localUrl = `http://localhost:${CONFIG.port}`;
  const publicUrl = CONFIG.railwayPublicDomain
    ? `https://${CONFIG.railwayPublicDomain}`
    : localUrl;
  const url = publicUrl;
  console.log("\n=================================================");
  console.log(`  SOLANA MEMECOIN PAPER TRADER v${CONFIG.appVersion}`);
  console.log(`  Dashboard: ${url}`);
  console.log(`  Bind: ${CONFIG.host}:${CONFIG.port}`);
  console.log(`  Railway: ${CONFIG.railwayEnvironment || "không"}`);
  console.log(`  Basic Auth: ${CONFIG.appPassword ? `BẬT (${CONFIG.appUsername})` : "TẮT"}`);
  console.log(`  Chế độ: ${CONFIG.mockMode ? "MOCK" : "LIVE"}`);
  console.log(`  Quét discovery mỗi: ${(CONFIG.scanIntervalMs / 1000).toFixed(0)} giây`);
  console.log(`  Giá/MC REST fallback: ${(CONFIG.fastTickerMs / 1000).toFixed(1)} giây · tối đa ${CONFIG.fastTickerMaxTokens} token`);
  console.log(`  Birdeye WS: ${birdeyeStatus.configured ? `BẬT · tối đa ${CONFIG.birdeyeWsMaxTokens} token · MC=${CONFIG.birdeyeMcMode}` : "TẮT (thiếu BIRDEYE_API_KEY)"}`);
  console.log(`  Gecko mỗi: ${(CONFIG.geckoRefreshMs / 1000).toFixed(0)} giây · ${CONFIG.geckoPages} trang`);
  console.log(`  RPC audit: ${CONFIG.rpcAudit ? "BẬT" : "TẮT"}`);
  console.log(`  Paper quote: ${CONFIG.mockMode ? "MOCK" : CONFIG.jupiterApiKey ? "JUPITER V2/V1 + DEX FALLBACK" : "DEX POOL FALLBACK (chưa có Jupiter key)"}`);
  console.log(`  Quote mode: ${CONFIG.paperQuoteMode}`);
  console.log(`  Profile: ${activeProfile().name} · ${activeProfile().code}`);
  console.log(`  Data bền vững: ${DATA_ROOT}`);
  console.log("=================================================\n");
  if (CONFIG.autoOpen && !CONFIG.railwayEnvironment && !process.env.RAILWAY_PROJECT_ID) openBrowser(localUrl);
  performScan(false);
  connectBirdeyeWebSocket();
  fastTickerTimer = setTimeout(runFastTicker, Math.min(CONFIG.fastTickerMs, 1200));
});

function openBrowser(url) {
  const command = process.platform === "win32"
    ? `start "" "${url}"`
    : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(command, () => {});
}

function mockTokens(tick) {
  const now = Date.now();
  const seeds = [
    ["CRABCAT", "Crab Cat", 84, 52_000, 212_000, 11_200, 42, 21, 9.8, "pump"],
    ["MOONBUN", "Moon Bunny", 77, 31_500, 145_000, 7_900, 30, 17, 6.2, "pump"],
    ["PEPEAI", "Pepe AI", 71, 22_000, 180_000, 5_400, 24, 18, 3.1, "raydium"],
    ["DOGCEO", "Dog CEO", 63, 15_500, 260_000, 3_100, 19, 17, -1.2, "meteora"],
    ["RUGMOON", "Rug Moon", 34, 4_100, 780_000, 18_000, 90, 4, 128, "pump"],
    ["SLOWCAT", "Slow Cat", 51, 12_500, 110_000, 480, 4, 9, -7.4, "raydium"]
  ];
  return seeds.map((s, i) => normalizeToken({
    id: `MockToken${i}pump`,
    chainId: "solana",
    source: "Mock",
    pairAddress: `MockPair${i}`,
    tokenAddress: `MockToken${i}pump`,
    name: s[1],
    symbol: s[0],
    imageUrl: null,
    quoteSymbol: "SOL",
    dexId: s[9],
    createdAt: now - (8 + i * 19) * 60_000,
    ageMinutes: 8 + i * 19,
    priceUsd: 0.00001 * (i + 1) * (1 + tick * 0.01),
    liquidityUsd: s[3],
    marketCap: s[4],
    fdv: s[4],
    volume5m: s[5] * (1 + Math.sin(tick / 3 + i) * 0.08),
    volume1h: s[5] * 7,
    volume24h: s[5] * 65,
    priceChange5m: s[8] + Math.sin(tick / 2 + i) * 2,
    priceChange1h: s[8] * 2,
    priceChange24h: s[8] * 4,
    buys5m: s[6] + (tick % 4),
    sells5m: s[7],
    buys1h: s[6] * 5,
    sells1h: s[7] * 5,
    txns5m: s[6] + s[7] + (tick % 4),
    txns1h: (s[6] + s[7]) * 5,
    socials: i < 4 ? { links: [{ type: "twitter" }] } : {},
    profileUrl: null,
    boosts: i < 2 ? 25 : 0,
    rawSource: "mock"
  }));
}

let shuttingDown = false;

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} — đóng SSE và HTTP server...`);

  clearTimeout(scanTimer);
  clearTimeout(fastTickerTimer);
  clearTimeout(birdeyeReconnectTimer);
  clearTimeout(birdeyeResubscribeTimer);
  clearTimeout(realtimeDeltaTimer);
  try { birdeyeSocket?.close(1000, "shutdown"); } catch {}
  for (const client of clients) {
    try { client.end(); } catch {}
  }

  const forceExit = setTimeout(() => process.exit(0), 12_000);
  forceExit.unref?.();

  server.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
