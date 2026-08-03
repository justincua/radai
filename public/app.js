"use strict";

const $ = id => document.getElementById(id);
let state = null;
let paper = null;
let watchlist = new Set();
let hiddenMemes = new Map();
let countdownTimer = null;
let paperRefreshTimer = null;
let pendingOrderPayload = null;
let latestQuote = null;
let instantToken = null;
let instantProfile = localStorage.getItem("instantProfile") || "P1";
const DEFAULT_INSTANT_PROFILES = Object.freeze({
  P1: [0.01, 0.02, 0.06, 1],
  P2: [0.001, 0.01, 0.03, 0.05],
  P3: [0.02, 0.04, 0.08, 0.1]
});
let instantProfiles = JSON.parse(JSON.stringify(DEFAULT_INSTANT_PROFILES));
let instantBusy = false;
let instantLastQuote = null;
let fastTickerReceivedAt = 0;
let historyRange = "all";
let historyType = "all";
let pnlCursor = new Date();
let tradeMode = localStorage.getItem("tradeMode") === "real" ? "real" : "paper";
let phantomProvider = null;
let walletState = { connected: false, address: null };
let realPortfolio = null;
let realQuickBalance = null;
let realPortfolioTimer = null;
let realBalanceTimer = null;
let phantomLastError = null;
let phantomDetectionState = "checking";
let realTradeBusy = false;

const fields = [
  "minAge", "maxAge", "minLiquidity", "minMcap", "maxMcap", "minVolume5m",
  "minTxns5m", "minScore", "minBuyRatio", "maxChange5m", "minMemeScore",
  "hideMintRisk", "onlySocial", "searchInput", "sortSelect"
];

const presets = {
  balanced: { minAge: 2, maxAge: 180, minLiquidity: 12000, minMcap: 25000, maxMcap: 1500000, minVolume5m: 2000, minTxns5m: 15, minScore: 55, minBuyRatio: 1, maxChange5m: 35, minMemeScore: 25, hideMintRisk: true, onlySocial: false },
  early: { minAge: 0, maxAge: 90, minLiquidity: 6000, minMcap: 10000, maxMcap: 700000, minVolume5m: 800, minTxns5m: 8, minScore: 45, minBuyRatio: .9, maxChange5m: 55, minMemeScore: 20, hideMintRisk: true, onlySocial: false },
  safe: { minAge: 10, maxAge: 720, minLiquidity: 35000, minMcap: 75000, maxMcap: 3000000, minVolume5m: 5000, minTxns5m: 35, minScore: 68, minBuyRatio: 1.15, maxChange5m: 25, minMemeScore: 30, hideMintRisk: true, onlySocial: true }
};

function value(id) {
  const el = $(id);
  if (!el) return undefined;
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number" || el.type === "range") return Number(el.value || 0);
  return el.value;
}

function setValue(id, v) {
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox") el.checked = Boolean(v);
  else el.value = v;
}

function currentFilters() { return Object.fromEntries(fields.map(id => [id, value(id)])); }
function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;
  for (const [key, val] of Object.entries(preset)) setValue(key, val);
  $("memeScoreValue").textContent = value("minMemeScore");
  saveFilters(); renderScanner();
}
function saveFilters() { localStorage.setItem("memeScannerFilters", JSON.stringify(currentFilters())); }
function loadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem("memeScannerFilters") || "{}");
    for (const [key, val] of Object.entries(saved)) setValue(key, val);
  } catch {}
  $("memeScoreValue").textContent = value("minMemeScore");
  $("paperSlippage").value = localStorage.getItem("paperSlippage") || "100";
  $("paperFillMode").value = localStorage.getItem("paperFillMode") || "mid";
}

function hasSocial(token) {
  const s = token.socials || {};
  return Boolean(s.twitter || s.telegram || s.discord || (Array.isArray(s.websites) && s.websites.length) || (Array.isArray(s.socialLinks) && s.socialLinks.length) || (Array.isArray(s.links) && s.links.length));
}

function filteredTokens() {
  if (!state?.tokens) return [];
  const f = currentFilters();
  const q = String(f.searchInput || "").trim().toLowerCase();
  const result = state.tokens.filter(t => {
    if (hiddenMemes.has(t.tokenAddress)) return false;
    if (t.ageMinutes < f.minAge || t.ageMinutes > f.maxAge) return false;
    if (t.liquidityUsd < f.minLiquidity) return false;
    if (t.marketCap < f.minMcap || (f.maxMcap > 0 && t.marketCap > f.maxMcap)) return false;
    if (t.volume5m < f.minVolume5m || t.txns5m < f.minTxns5m) return false;
    if (t.score < f.minScore || t.buySellRatio < f.minBuyRatio) return false;
    if (t.priceChange5m > f.maxChange5m || t.memeScore < f.minMemeScore) return false;
    if (f.onlySocial && !hasSocial(t)) return false;
    if (f.hideMintRisk && t.audit && (t.audit.mintAuthority || t.audit.freezeAuthority)) return false;
    if (q && !`${t.symbol} ${t.name} ${t.tokenAddress}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const sort = f.sortSelect;
  result.sort((a, b) => sort === "newest" ? a.ageMinutes - b.ageMinutes : sort === "volume" ? b.volume5m - a.volume5m : sort === "liquidity" ? b.liquidityUsd - a.liquidityUsd : sort === "momentum" ? b.priceChange5m - a.priceChange5m : b.score - a.score || b.volume5m - a.volume5m);
  return result;
}

function fmtMoney(v, compact = true, max = null) {
  const num = Number(v || 0);
  if (!Number.isFinite(num)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: max ?? (Math.abs(num) < 1 ? 6 : 2),
    notation: compact && Math.abs(num) >= 1000 ? "compact" : "standard"
  }).format(num);
}
function fmtNum(v, digits = 2) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(v || 0)); }
function fmtToken(v) {
  const n = Math.abs(Number(v || 0));
  if (n >= 1e9) return `${fmtNum(n / 1e9, 2)}B`;
  if (n >= 1e6) return `${fmtNum(n / 1e6, 2)}M`;
  if (n >= 1e3) return `${fmtNum(n / 1e3, 2)}K`;
  return fmtNum(n, n < 1 ? 6 : 3);
}
function fmtAge(minutes) { if (minutes < 1) return "<1 phút"; if (minutes < 60) return `${Math.floor(minutes)} phút`; if (minutes < 1440) return `${Math.floor(minutes / 60)}g ${Math.floor(minutes % 60)}p`; return `${Math.floor(minutes / 1440)} ngày`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function scoreClass(score) { return score >= 72 ? "" : score >= 55 ? "medium" : "low"; }
function safeUrl(url) { try { const u = new URL(url); return ["http:", "https:"].includes(u.protocol) ? u.toString() : "#"; } catch { return "#"; } }
function pnlClass(v) { return Number(v) >= 0 ? "positive" : "negative"; }


function activeTradingView() {
  return tradeMode === "real" ? realPortfolio : paper;
}
function activeAccount() {
  return activeTradingView()?.account || null;
}
function activeSummary() {
  return activeTradingView()?.summary || null;
}
function activePositions() {
  return activeAccount()?.positions || [];
}
function shortMint(mint) {
  const value = String(mint || "");
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}
function activePositionByMint(mint) {
  return activePositions().find(position => position.tokenAddress === mint) || null;
}
function modeLabel() {
  return tradeMode === "real" ? "REAL" : "PAPER";
}

function tokenCard(token) {
  const img = token.imageUrl ? `<img class="token-logo" src="${escapeHtml(safeUrl(token.imageUrl))}" alt="" onerror="this.outerHTML='<div class=&quot;token-logo&quot;>${escapeHtml(token.symbol.slice(0,2))}</div>'">` : `<div class="token-logo">${escapeHtml(token.symbol.slice(0, 2))}</div>`;
  const risks = (token.riskFlags || []).slice(0, 3).map(x => `<span class="tag risk">${escapeHtml(x)}</span>`).join("");
  const good = [token.memeScore >= 40 ? `<span class="tag good">Meme ${token.memeScore}</span>` : "", token.audit && token.audit.mintAuthority === null && token.audit.freezeAuthority === null ? `<span class="tag good">Mint/Freeze tắt</span>` : "", token.boosts > 0 ? `<span class="tag">Boost ${fmtNum(token.boosts, 0)}</span>` : ""].join("");
  const dexUrl = `https://dexscreener.com/solana/${encodeURIComponent(token.pairAddress || token.tokenAddress)}`;
  const birdUrl = `https://birdeye.so/token/${encodeURIComponent(token.tokenAddress)}?chain=solana`;
  const watched = watchlist.has(token.tokenAddress);
  const position = activePositionByMint(token.tokenAddress);
  const selected = instantToken?.tokenAddress === token.tokenAddress;
  return `<article class="token-card ${selected ? "instant-selected" : ""}">
    <div class="token-top"><div class="token-identity">${img}<div class="token-name"><h4>${escapeHtml(token.symbol)} <span style="color:#555;font-weight:400">/ ${escapeHtml(token.quoteSymbol)}</span></h4><p>${escapeHtml(token.name)} · ${escapeHtml(token.dexId)} · ${fmtAge(token.ageMinutes)}</p></div></div><div class="score ${scoreClass(token.score)}"><strong>${token.score}</strong><small>${escapeHtml(token.grade)}</small></div></div>
    <div class="metrics">
      <div class="metric"><span>Thanh khoản</span><strong>${fmtMoney(token.liquidityUsd)}</strong></div><div class="metric"><span>Market cap</span><strong>${fmtMoney(token.marketCap)}</strong></div><div class="metric"><span>Volume 5m</span><strong>${fmtMoney(token.volume5m)}</strong></div><div class="metric"><span>Giá 5m</span><strong class="${pnlClass(token.priceChange5m)}">${token.priceChange5m >= 0 ? "+" : ""}${fmtNum(token.priceChange5m)}%</strong></div>
      <div class="metric"><span>Mua / Bán</span><strong>${token.buys5m} / ${token.sells5m}</strong></div><div class="metric"><span>Tỷ lệ mua</span><strong>${fmtNum(token.buySellRatio, 2)}x</strong></div><div class="metric"><span>Liq / MC</span><strong>${fmtNum(token.liquidityRatio * 100)}%</strong></div><div class="metric"><span>Giá</span><strong>${fmtMoney(token.priceUsd, false)}</strong></div>
    </div>
    <div class="tags">${good}${risks || `<span class="tag">Chưa audit on-chain</span>`}${position ? `<span class="tag good">Đang giữ ${fmtToken(position.quantity)}</span>` : ""}</div>
    <div class="quick-trade"><span>${tradeMode === "real" ? "REAL · Phantom" : "Paper trade"}</span><button class="select-instant" data-token='${escapeHtml(JSON.stringify(minToken(token)))}'>⚡ Trade nhanh</button><button class="instant-card-buy" data-sol="0.01" data-token='${escapeHtml(JSON.stringify(minToken(token)))}'>0.01 SOL</button><button class="quick-buy" data-usd="10" data-token='${escapeHtml(JSON.stringify(minToken(token)))}'>Chi tiết $10</button></div>
    <div class="card-actions"><button class="copy" data-address="${escapeHtml(token.tokenAddress)}">Copy CA</button><button class="watch ${watched ? "active" : ""}" data-address="${escapeHtml(token.tokenAddress)}" data-symbol="${escapeHtml(token.symbol)}" data-name="${escapeHtml(token.name)}">${watched ? "★ Đã lưu" : "☆ Lưu"}</button><button class="hide-meme" data-token='${escapeHtml(JSON.stringify(minToken(token)))}'>🙈 Ẩn</button><a href="${birdUrl}" target="_blank" rel="noreferrer">Birdeye</a><a href="${dexUrl}" target="_blank" rel="noreferrer">DEX</a></div>
  </article>`;
}
function minToken(token) {
  return {
    tokenAddress: token.tokenAddress, symbol: token.symbol, name: token.name,
    priceUsd: token.priceUsd, marketCap: token.marketCap, liquidityUsd: token.liquidityUsd,
    dexId: token.dexId, pairAddress: token.pairAddress, priceChange5m: token.priceChange5m,
    riskFlags: token.riskFlags || [], score: token.score
  };
}

function renderScanner() {
  if (!state) return;
  const tokens = filteredTokens();
  $("orbCount").textContent = state.tokens?.length || 0;
  $("visibleCount").textContent = tokens.length;
  if ($("hiddenMemesCount")) $("hiddenMemesCount").textContent = hiddenMemes.size;
  $("strongCount").textContent = tokens.filter(t => t.score >= 72).length;
  $("volumeTotal").textContent = fmtMoney(tokens.reduce((s, t) => s + t.volume5m, 0));
  $("sourceLabel").textContent = state.source || "Chưa có nguồn";
  const marketAt = fastTickerReceivedAt || state.config?.fastTickerUpdatedAt || state.updatedAt;
  $("updatedText").textContent = marketAt ? `Giá/MC ${new Date(marketAt).toLocaleTimeString("vi-VN")}` : "Chưa có dữ liệu";
  $("resultMessage").textContent = state.status === "loading" ? "Đang cập nhật dữ liệu…" : `${tokens.length}/${state.tokens.length} token qua bộ lọc · ${state.durationMs || 0}ms`;
  const pill = $("connectionPill");
  pill.className = `pill ${state.status === "ok" ? "ok" : state.status === "error" ? "error" : "pending"}`;
  pill.innerHTML = `<span></span>${state.status === "ok" ? (state.mode === "mock" ? "Mock realtime" : "Live") : state.status === "error" ? "Có lỗi" : "Đang quét"}`;
  $("scanButton").disabled = state.scanning;
  $("scanButton").textContent = state.scanning ? "Đang quét…" : "Quét ngay";
  const errors = (state.errors || []).filter(Boolean);
  const box = $("errorBox");
  if (errors.length) { box.classList.remove("hidden"); box.innerHTML = `<strong>Lưu ý nguồn dữ liệu:</strong><br>${errors.map(escapeHtml).join("<br>")}`; } else box.classList.add("hidden");
  $("cards").innerHTML = tokens.length ? tokens.map(tokenCard).join("") : `<div class="empty-state"><h4>Không có token phù hợp</h4><p>Nới bộ lọc thanh khoản, volume hoặc điểm tối thiểu.</p></div>`;
  if (!instantToken && tokens.length) instantToken = minToken(tokens[0]);
  syncInstantTokenFromState();
  renderInstantPanel();
}

function renderPaper() {
  if (tradeMode === "real") return renderRealAccount();
  if (!paper) return;
  const a = paper.account, s = paper.summary;
  const profile = paper.profile || {};
  document.body.classList.remove("real-mode");
  if ($("topProfileName")) $("topProfileName").textContent = profile.name || "Profile";
  if ($("depositCurrentUsd")) $("depositCurrentUsd").textContent = fmtMoney(a.usdBalance, false, 2);
  $("walletModeEyebrow").textContent = "PAPER TRADING · KHÔNG DÙNG TIỀN THẬT";
  $("walletModeTitle").textContent = "Ví giao dịch thử";
  $("cashBalanceLabel").textContent = "USD/USDC ảo";
  $("cashBalanceNote").textContent = "Tiền mặt mô phỏng";
  $("solBalanceLabel").textContent = "SOL ảo";
  $("positionsModeBadge").textContent = "PAPER";
  $("paperEquity").textContent = fmtMoney(s.equityUsd, false, 2);
  $("paperTotalPnl").innerHTML = `<span class="${pnlClass(s.totalPnlUsd)}">${s.totalPnlUsd >= 0 ? "+" : ""}${fmtMoney(s.totalPnlUsd, false, 2)} (${s.totalPnlPct >= 0 ? "+" : ""}${fmtNum(s.totalPnlPct)}%)</span>`;
  $("paperUsd").textContent = fmtMoney(a.usdBalance, false, 2);
  $("paperSol").textContent = `${fmtNum(a.solBalance, 6)} SOL`;
  $("paperSolValue").textContent = s.solPriceUsd > 0
    ? `${fmtMoney(a.solBalance * s.solPriceUsd, false, 2)} · SOL ${fmtMoney(s.solPriceUsd, false, 2)}`
    : `Đã đọc on-chain · USD tạm chưa có`;
  $("paperPositionsCount").textContent = a.positions.length;
  $("paperFees").textContent = `Phí đã tính ${fmtMoney(s.feesPaidUsd, false, 4)}`;
  $("paperUnrealized").innerHTML = `PnL chưa chốt <span class="${pnlClass(s.unrealizedPnlUsd)}">${s.unrealizedPnlUsd >= 0 ? "+" : ""}${fmtMoney(s.unrealizedPnlUsd, false, 2)}</span>`;
  $("paperTradeCount").textContent = `${a.trades.length} lệnh`;
  const sourceLabel = paper.config.jupiterMode === "mock" ? "Mock" : paper.config.jupiterMode === "v2+v1" ? "Jupiter thật + DEX dự phòng" : "DEX pool thật";
  $("paperStatus").innerHTML = `<span class="status-dot ok"></span> ${escapeHtml(profile.name || "Profile")} · v${paper.config.version || "3"} · ${sourceLabel} · Giá/MC realtime · Số dư ảo`;
  $("paperPositions").innerHTML = a.positions.length ? a.positions.map(positionCard).join("") : `<div class="paper-empty">Chưa có vị thế. Chọn token và mua thử.</div>`;
  $("paperHistory").innerHTML = a.trades.length ? a.trades.slice(0, 50).map(tradeRow).join("") : `<div class="paper-empty">Chưa có lịch sử giao dịch.</div>`;
  updateModeControls();
  renderInstantPanel();
  renderProfilePopup();
  renderFullHistory();
  renderPnlCalendar();
  renderScanner();
}

function realPositionsWithLiveMarket() {
  const source = realPortfolio?.account?.positions || [];
  return source.map(position => {
    const live = state?.tokens?.find(token => token.tokenAddress === position.tokenAddress);
    const priceUsd = Number(live?.priceUsd || position.priceUsd || 0);
    const currentMarketCap = Number(live?.marketCap || position.currentMarketCap || 0);
    const marketValueUsd = position.quantity * priceUsd;
    const unrealizedPnlUsd = position.costBasisUsd > 0 ? marketValueUsd - position.costBasisUsd : 0;
    return {
      ...position,
      priceUsd,
      currentMarketCap,
      marketValueUsd,
      unrealizedPnlUsd,
      pnlPct: position.costBasisUsd > 0 ? unrealizedPnlUsd / position.costBasisUsd * 100 : 0,
      marketCapChangePct: position.entryMarketCap > 0 ? (currentMarketCap - position.entryMarketCap) / position.entryMarketCap * 100 : 0
    };
  });
}

function renderRealAccount() {
  document.body.classList.add("real-mode");
  updateModeControls();
  $("walletModeEyebrow").textContent = "REAL TRADING · PHANTOM KÝ TỪNG GIAO DỊCH";
  $("walletModeTitle").textContent = "Ví Phantom thật";
  $("cashBalanceLabel").textContent = "USDC thật";
  $("cashBalanceNote").textContent = "Số dư đọc trực tiếp từ Phantom";
  $("solBalanceLabel").textContent = "SOL thật";
  $("positionsModeBadge").textContent = "REAL";

  if (!walletState.connected) {
    $("paperStatus").innerHTML = `<span class="status-dot bad"></span> Chưa kết nối Phantom. Dùng nút kết nối ngay bên dưới.`;
    $("paperEquity").textContent = "—";
    $("paperTotalPnl").textContent = "Chưa kết nối";
    $("paperUsd").textContent = "—";
    $("paperSol").textContent = "—";
    $("paperSolValue").textContent = "—";
    $("paperPositionsCount").textContent = "0";
    $("paperFees").textContent = "Phí REAL —";
    $("paperUnrealized").textContent = "PnL chưa chốt —";
    $("paperTradeCount").textContent = "0 lệnh";
    $("paperPositions").innerHTML = `<div class="paper-empty">Kết nối Phantom để hiện từng vị thế theo contract/mint.</div>`;
    $("paperHistory").innerHTML = `<div class="paper-empty">Chưa có lịch sử REAL trên ứng dụng.</div>`;
    updatePhantomConnectPanel();
    renderInstantPanel();
    return;
  }

  // A lightweight getBalance result is shown immediately while the full SPL portfolio loads.
  if (!realPortfolio) {
    const q = realQuickBalance;
    const solBalance = Number(q?.solBalance || 0);
    const solPrice = Number(q?.solPriceUsd || 0);
    const usdc = Number(q?.usdcBalance || 0);
    const equity = solPrice > 0 ? solBalance * solPrice + usdc : null;
    $("paperStatus").innerHTML = `<span class="status-dot ok"></span> <span class="real-wallet-address">${escapeHtml(shortMint(walletState.address))}</span> · Đã kết nối · đang tải token SPL…`;
    $("paperEquity").textContent = q ? (equity == null ? `${fmtNum(solBalance, 6)} SOL` : fmtMoney(equity, false, 2)) : "Đang đọc…";
    $("paperTotalPnl").innerHTML = q?.lowBalanceWarning
      ? `<span class="real-low-balance">${escapeHtml(q.lowBalanceWarning)}</span>`
      : "Đang tải giá vốn";
    $("paperUsd").textContent = q ? fmtMoney(usdc, false, 2) : "…";
    $("paperSol").textContent = q ? `${fmtNum(solBalance, 6)} SOL` : "Đang đọc…";
    $("paperSolValue").textContent = q
      ? (solPrice > 0
          ? `${fmtMoney(solBalance * solPrice, false, 2)} · SOL ${fmtMoney(solPrice, false, 2)}`
          : `Đã đọc on-chain · USD tạm chưa có`)
      : "RPC mainnet";
    $("paperPositionsCount").textContent = "…";
    $("paperFees").textContent = "Đang tải token";
    $("paperUnrealized").textContent = "PnL chưa chốt —";
    $("paperTradeCount").textContent = "Đang tải";
    $("paperPositions").innerHTML = `<div class="paper-empty">Đã nhận public key. Đang tải token SPL và vị thế…</div>`;
    $("paperHistory").innerHTML = `<div class="paper-empty">Đang tải lịch sử REAL của ví.</div>`;
    updatePhantomConnectPanel();
    renderInstantPanel();
    return;
  }

  const positions = realPositionsWithLiveMarket();
  realPortfolio.account.positions = positions;
  const a = realPortfolio.account;
  const s = realPortfolio.summary;
  if (realQuickBalance) {
    a.solBalance = Number(realQuickBalance.solBalance ?? a.solBalance);
    a.usdBalance = Number(realQuickBalance.usdcBalance ?? a.usdBalance);
    s.solPriceUsd = Number(realQuickBalance.solPriceUsd ?? s.solPriceUsd);
  }
  const positionsValue = positions.reduce((sum, p) => sum + Number(p.marketValueUsd || 0), 0);
  const unrealized = positions.reduce((sum, p) => sum + Number(p.unrealizedPnlUsd || 0), 0);
  const equity = a.usdBalance + a.solBalance * s.solPriceUsd + positionsValue;
  const totalPnl = Number(a.realizedPnlUsd || 0) + unrealized;

  const lowBalanceText = realQuickBalance?.lowBalanceWarning
    ? ` · <span class="real-low-balance">SOL thấp</span>`
    : "";
  $("paperStatus").innerHTML = `<span class="status-dot ok"></span> <span class="real-wallet-address">${escapeHtml(shortMint(walletState.address))}</span> · Phantom REAL · SOL 1s · Giá/MC 1s${lowBalanceText}`;
  $("paperEquity").textContent = fmtMoney(equity, false, 2);
  $("paperTotalPnl").innerHTML = `<span class="${pnlClass(totalPnl)}">${totalPnl >= 0 ? "+" : ""}${fmtMoney(totalPnl, false, 2)} · PnL theo lệnh đã thực hiện bằng app</span>`;
  $("paperUsd").textContent = fmtMoney(a.usdBalance, false, 2);
  $("paperSol").textContent = `${fmtNum(a.solBalance, 6)} SOL`;
  $("paperSolValue").textContent = `${fmtMoney(a.solBalance * s.solPriceUsd, false, 2)} · SOL ${fmtMoney(s.solPriceUsd, false, 2)}`;
  $("paperPositionsCount").textContent = positions.length;
  $("paperFees").textContent = `Phí app ghi nhận ${fmtMoney(s.feesPaidUsd, false, 4)}`;
  $("paperUnrealized").innerHTML = `PnL chưa chốt <span class="${pnlClass(unrealized)}">${unrealized >= 0 ? "+" : ""}${fmtMoney(unrealized, false, 2)}</span>`;
  $("paperTradeCount").textContent = `${a.trades.length} lệnh REAL`;
  $("paperPositions").innerHTML = positions.length ? positions.map(positionCard).join("") : `<div class="paper-empty">Phantom chưa có token meme nào.</div>`;
  $("paperHistory").innerHTML = a.trades.length ? a.trades.slice(0, 50).map(tradeRow).join("") : `<div class="paper-empty">Chưa có lệnh REAL được thực hiện bằng ứng dụng.</div>`;
  renderInstantPanel();
  renderFullHistory();
  renderPnlCalendar();
  renderScanner();
}
function positionCard(p) {
  const untracked = tradeMode === "real" && !p.trackedByApp;
  return `<article class="position-card" data-mint="${escapeHtml(p.tokenAddress)}">
    <div>
      <div class="position-symbol-row"><strong><span class="live-dot"></span>${escapeHtml(p.symbol)}</strong><span class="tag">${escapeHtml(shortMint(p.tokenAddress))}</span></div>
      <small>${fmtToken(p.quantity)} token · ${untracked ? `<span class="real-untracked">Không có giá vốn trong app</span>` : `Giá vốn ${fmtMoney(p.avgEntryUsd, false)}`}</small>
      <span class="position-contract">${escapeHtml(p.tokenAddress)}</span>
    </div>
    <div class="position-value"><strong>${fmtMoney(p.marketValueUsd, false, 2)}</strong><small class="${pnlClass(p.unrealizedPnlUsd)}">${untracked ? "PnL —" : `${p.unrealizedPnlUsd >= 0 ? "+" : ""}${fmtMoney(p.unrealizedPnlUsd, false, 2)} · ${p.pnlPct >= 0 ? "+" : ""}${fmtNum(p.pnlPct)}%`}</small></div>
    <div class="position-mc-grid">
      <div><span>MC mua TB</span><strong>${p.entryMarketCap ? fmtMoney(p.entryMarketCap) : "—"}</strong></div>
      <div><span>MC hiện tại</span><strong>${p.currentMarketCap ? fmtMoney(p.currentMarketCap) : "—"}</strong></div>
      <div><span>MC thay đổi</span><strong class="${pnlClass(p.marketCapChangePct)}">${p.entryMarketCap ? `${p.marketCapChangePct >= 0 ? "+" : ""}${fmtNum(p.marketCapChangePct)}%` : "—"}</strong></div>
    </div>
    <div class="position-actions"><a class="position-gmgn" href="https://gmgn.ai/sol/token/${encodeURIComponent(p.tokenAddress)}" target="_blank" rel="noreferrer">GMGN ↗</a><button class="copy-position-mint" data-address="${escapeHtml(p.tokenAddress)}">Copy CA</button><button class="instant-position-select" data-address="${escapeHtml(p.tokenAddress)}">⚡ Chọn</button><button class="instant-position-sell" data-percent="25" data-address="${escapeHtml(p.tokenAddress)}">Bán 25%</button><button class="instant-position-sell" data-percent="50" data-address="${escapeHtml(p.tokenAddress)}">50%</button><button class="instant-position-sell danger" data-percent="100" data-address="${escapeHtml(p.tokenAddress)}">Bán hết</button></div>
  </article>`;
}
function tradeRow(t) {
  const isSell = t.type === "SELL";
  const isBuy = t.type === "BUY";
  const isDeposit = t.type === "DEPOSIT";
  const mc = isSell ? t.marketCapAtExit : t.marketCapAtEntry;
  const mcText = mc ? ` · MC ${fmtMoney(mc)}` : "";
  const quantityText = isDeposit ? `+${fmtMoney(t.amountUsd || t.inputUsd, false, 2)}` : t.quantity ? `${fmtToken(t.quantity)}${mcText}` : "—";
  const right = isSell
    ? `${nSign(t.pnlUsd)}${fmtMoney(t.pnlUsd, false, 2)}`
    : isDeposit ? "Vốn gốc" : `${fmtMoney(t.quote?.gas?.totalUsd || 0, false, 4)} phí`;
  const typeClass = isSell ? "sell" : isDeposit ? "deposit" : isBuy ? "buy" : "convert";
  return `<div class="history-row"><span class="history-type ${typeClass}">${escapeHtml(t.type)}</span><strong>${escapeHtml(t.symbol || "—")}</strong><span>${quantityText}</span><span>${new Date(t.createdAt).toLocaleString("vi-VN")}</span><span class="${isSell ? pnlClass(t.pnlUsd) : ""}">${right}</span></div>`;
}
function nSign(v) { return Number(v || 0) > 0 ? "+" : ""; }


function normalizeInstantProfiles(input) {
  const result = {};
  for (const profile of ["P1", "P2", "P3"]) {
    const fallback = DEFAULT_INSTANT_PROFILES[profile];
    const source = Array.isArray(input?.[profile]) ? input[profile] : fallback;
    result[profile] = [0,1,2,3].map(index => {
      const value = Number(source[index]);
      return Number.isFinite(value) && value > 0
        ? Math.min(1000, Math.max(0.000001, Math.round(value * 1e9) / 1e9))
        : fallback[index];
    });
  }
  return result;
}
async function loadInstantProfiles() {
  try {
    const response = await fetch("/api/settings/quick-trade", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    instantProfiles = normalizeInstantProfiles(data.settings?.presets);
  } catch {
    try {
      instantProfiles = normalizeInstantProfiles(JSON.parse(localStorage.getItem("instantProfilesFallback") || "null"));
    } catch {
      instantProfiles = normalizeInstantProfiles(null);
    }
  }
}
function renderInstantPresetEditor() {
  const editor = $("instantPresetEditor");
  if (!editor) return;
  editor.innerHTML = ["P1", "P2", "P3"].map(profile => `
    <div class="instant-preset-row" data-profile="${profile}">
      <strong>${profile}</strong>
      ${(instantProfiles[profile] || DEFAULT_INSTANT_PROFILES[profile]).map((amount, index) => `
        <label>Nút ${index + 1}<input class="instant-preset-input" data-profile="${profile}" data-index="${index}" type="number" min="0.000001" max="1000" step="0.000001" value="${amount}"></label>
      `).join("")}
    </div>`).join("");
}
async function saveInstantProfileEditor() {
  const next = JSON.parse(JSON.stringify(instantProfiles));
  document.querySelectorAll(".instant-preset-input").forEach(input => {
    const profile = input.dataset.profile;
    const index = Number(input.dataset.index);
    if (next[profile] && Number.isInteger(index)) next[profile][index] = Number(input.value);
  });
  const normalized = normalizeInstantProfiles(next);
  const data = await apiPost("/api/settings/quick-trade", { presets: normalized });
  instantProfiles = normalizeInstantProfiles(data.settings?.presets);
  localStorage.setItem("instantProfilesFallback", JSON.stringify(instantProfiles));
  closePopup("instantPresetModal");
  renderInstantPanel();
  toast("Đã lưu P1/P2/P3");
}
function makeClientOrderId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `instant-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function syncInstantTokenFromState() {
  if (!instantToken?.tokenAddress || !state?.tokens) return;
  const fresh = state.tokens.find(token => token.tokenAddress === instantToken.tokenAddress);
  if (fresh) instantToken = { ...instantToken, ...minToken(fresh) };
}
function instantPosition() { return activePositionByMint(instantToken?.tokenAddress); }
function selectInstantToken(token, open = true) {
  if (!token?.tokenAddress) return toast("Token không hợp lệ");
  instantToken = { ...token };
  localStorage.setItem("instantToken", JSON.stringify(instantToken));
  if (open) $("instantTradePanel").classList.remove("closed", "collapsed");
  renderInstantPanel(); renderScanner();
}
function instantGasEstimateSol(hasPosition = false) {
  if (tradeMode === "real") {
    if (instantLastQuote?.tokenAddress === instantToken?.tokenAddress && Number.isFinite(Number(instantLastQuote?.gasSol))) {
      return Number(instantLastQuote.gasSol);
    }
    return 0;
  }
  const f = paper?.config?.fees || {};
  return (Number(f.signatureLamports || 5000) + Number(f.priorityLamports || 50000) + (hasPosition ? 0 : Number(f.ataRentLamports || 2039280))) / 1e9;
}
function instantRealReserveSol() {
  return Math.max(0, Number(realPortfolio?.config?.minSolReserve ?? 0.00005));
}
function canAffordInstantBuy(amount, account, hasPosition) {
  const balance = Number(account?.solBalance || 0);
  if (tradeMode === "real") return amount + instantRealReserveSol() <= balance + 1e-12;
  return amount + instantGasEstimateSol(hasPosition) <= balance + 1e-12;
}
function renderInstantPanel() {
  if (!$("instantTradePanel")) return;
  syncInstantTokenFromState();
  const token = instantToken, position = instantPosition(), account = activeAccount(), summary = activeSummary();
  const slippage = Number($("instantSlippage")?.value || $("paperSlippage")?.value || 100);
  $("instantTokenSymbol").textContent = token?.symbol || "CHỌN TOKEN";
  $("instantTokenMeta").textContent = token ? `${token.dexId || "DEX"} · Liq ${fmtMoney(token.liquidityUsd || 0)} · Score ${token.score ?? "—"}` : "Bấm ⚡ Trade nhanh trên token";
  $("instantTokenPrice").textContent = token ? fmtMoney(token.priceUsd, false) : "—";
  $("instantTokenMc").textContent = token ? `MC ${fmtMoney(token.marketCap || 0)}` : "MC —";
  $("instantSolBalance").textContent = account ? `${fmtNum(account.solBalance, 5)} SOL` : "0 SOL";
  $("instantModeLabel").textContent = tradeMode === "real" ? "REAL · Jupiter RTSE · Phantom ký từng lệnh" : "PAPER · khớp một chạm";
  $("instantPositionLabel").textContent = position ? `${fmtToken(position.quantity)} ${position.symbol} · ${fmtMoney(position.marketValueUsd, false, 2)}` : "Chưa có vị thế";
  $("instantEntryLabel").textContent = position ? `Giá vốn ${fmtMoney(position.avgEntryUsd, false)}` : "Giá vốn —";
  $("instantEntryMc").textContent = position?.entryMarketCap ? fmtMoney(position.entryMarketCap) : "—";
  $("instantCurrentMc").textContent = position?.currentMarketCap ? fmtMoney(position.currentMarketCap) : token?.marketCap ? fmtMoney(token.marketCap) : "—";
  $("instantSlipLabel").textContent = `${fmtNum(slippage / 100, 2)}%`; $("instantSellSlipLabel").textContent = `${fmtNum(slippage / 100, 2)}%`;
  const buyGas = instantGasEstimateSol(Boolean(position));
  const sellGas = instantGasEstimateSol(true);
  $("instantGasLabel").textContent = tradeMode === "real" && !buyGas ? "quote khi bấm" : `${fmtNum(buyGas, 6)} SOL`;
  $("instantSellGasLabel").textContent = tradeMode === "real" && !sellGas ? "quote khi bấm" : `${fmtNum(sellGas, 6)} SOL`;
  $("instantRiskLabel").textContent = token ? ((token.riskFlags?.length || 0) ? `${token.riskFlags.length} cảnh báo` : "Thấp") : "—";
  $("instantImpactLabel").textContent = instantLastQuote?.side === "buy" ? `${fmtNum(instantLastQuote.priceImpactPct, 2)}%` : "khi khớp";
  $("instantSellImpactLabel").textContent = instantLastQuote?.side === "sell" ? `${fmtNum(instantLastQuote.priceImpactPct, 2)}%` : "khi khớp";
  const presets = instantProfiles[instantProfile] || instantProfiles.P1;
  $("instantBuyButtons").innerHTML = presets.map(amount => {
    const affordable = Boolean(token && account && canAffordInstantBuy(amount, account, Boolean(position)));
    const reserve = tradeMode === "real" ? instantRealReserveSol() : instantGasEstimateSol(Boolean(position));
    const title = affordable
      ? (tradeMode === "real" ? `Bấm để lấy phí/rent thật từ Jupiter. Dự phòng tối thiểu ${reserve} SOL.` : `Ước tính tổng cần ${(amount + reserve).toFixed(6)} SOL`)
      : `Không đủ SOL theo số dư hiện tại. Cần tối thiểu ${(amount + reserve).toFixed(6)} SOL trước khi lấy quote.`;
    const disabled = !affordable || instantBusy || !$("instantArmed").checked;
    return `<button class="instant-buy-button ${affordable ? "real-affordable" : ""}" data-sol="${amount}" title="${escapeHtml(title)}" ${disabled ? "disabled" : ""}>${amount}</button>`;
  }).join("");
  document.querySelectorAll(".instant-profile").forEach(btn => btn.classList.toggle("active", btn.dataset.profile === instantProfile));
  document.querySelectorAll(".instant-sell-button").forEach(btn => btn.disabled = !position || instantBusy || !$("instantArmed").checked);
  $("instantEquity").textContent = summary ? fmtMoney(summary.equityUsd, false, 2) : "—";
  const buys = account?.trades?.filter(t => t.type === "BUY" && (!token || t.tokenAddress === token.tokenAddress)) || [];
  const sells = account?.trades?.filter(t => t.type === "SELL" && (!token || t.tokenAddress === token.tokenAddress)) || [];
  $("instantBought").textContent = buys.length ? fmtMoney(buys.reduce((sum,t)=>sum+Number(t.inputUsd||0),0), false, 2) : "$0";
  $("instantSold").textContent = sells.length ? fmtMoney(sells.reduce((sum,t)=>sum+Number(t.proceedsUsd||0),0), false, 2) : "$0";
  const tokenPnl = position ? Number(position.unrealizedPnlUsd||0)+Number(position.realizedPnlUsd||0) : sells.reduce((sum,t)=>sum+Number(t.pnlUsd||0),0);
  $("instantPnl").textContent = `${tokenPnl >= 0 ? "+" : ""}${fmtMoney(tokenPnl, false, 2)}`; $("instantPnl").className = pnlClass(tokenPnl);
}
function setInstantMessage(text, type="") { const box=$("instantMessage"); box.textContent=text; box.className=`instant-message ${type}`.trim(); }
function setInstantBusy(busy) { instantBusy=busy; $("instantProgress").classList.toggle("hidden", !busy); renderInstantPanel(); }
async function executeInstantTrade(payload) {
  if (instantBusy || realTradeBusy) return;
  if (!$("instantArmed").checked) return setInstantMessage(`Bật ON để giao dịch ${modeLabel()}.`, "warning");
  if (!instantToken && ["buy","sell"].includes(payload.side)) return setInstantMessage("Chưa chọn token.", "error");

  if (tradeMode === "real") {
    return executeRealInstantTrade(payload);
  }

  const request = { ...payload, ...(payload.side === "buy" ? instantToken : {}), slippageBps:Number($("instantSlippage").value||100), fillMode:$("instantFillMode").value||"mid", instant:true, clientOrderId:makeClientOrderId() };
  setInstantBusy(true); setInstantMessage("Đang lấy giá mới nhất và khớp lệnh ảo…");
  try {
    const result = await apiPost("/api/paper/instant", request); paper=result.paper;
    instantLastQuote={side:payload.side,priceImpactPct:result.trade?.quote?.priceImpactPct||0}; renderPaper();
    const t=result.trade, action=t.type==="BUY"?"MUA":t.type==="SELL"?"BÁN":t.type;
    setInstantMessage(`${action} ${t.symbol||""} đã khớp${t.marketCapAtEntry?` · MC ${fmtMoney(t.marketCapAtEntry)}`:""}${t.pnlUsd?` · PnL ${t.pnlUsd>=0?"+":""}${fmtMoney(t.pnlUsd,false,2)}`:""}`, t.type==="SELL"&&t.pnlUsd<0?"error":"success");
    toast(`${action} ${t.symbol||""} đã khớp ngay`);
  } catch(error) { setInstantMessage(error.message,"error"); toast(`Quick Trade: ${error.message}`); }
  finally { setInstantBusy(false); }
}

function getPhantomProvider() {
  const modern = window.phantom?.solana;
  if (modern?.isPhantom) return modern;
  const legacy = window.solana;
  if (legacy?.isPhantom) return legacy;
  return null;
}

async function waitForPhantomProvider(timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const provider = getPhantomProvider();
    if (provider) {
      phantomDetectionState = "found";
      return provider;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  phantomDetectionState = "missing";
  return null;
}

function phantomErrorText(error) {
  const code = Number(error?.code);
  if (code === 4001) return "Bạn chưa chấp nhận kết nối trong Phantom.";
  if (code === 4100) return "Trang chưa được Phantom cấp quyền cho tài khoản này.";
  if (code === 4900) return "Phantom đang mất kết nối mạng Solana.";
  if (code === -32002) return "Phantom đang có một cửa sổ yêu cầu khác. Hãy mở extension và xử lý cửa sổ đó trước.";
  return String(error?.message || error || "Không thể kết nối Phantom");
}

function connectedPublicKey(provider, response) {
  const key = response?.publicKey || provider?.publicKey;
  if (!key) return null;
  if (typeof key === "string") return key;
  if (typeof key.toString === "function") return key.toString();
  return null;
}

function updatePhantomConnectPanel() {
  const panel = $("phantomConnectPanel");
  if (!panel) return;
  const show = tradeMode === "real" && !walletState.connected;
  panel.classList.toggle("hidden", !show);
  if (!show) return;

  const found = Boolean(getPhantomProvider());
  const title = $("phantomConnectTitle");
  const detail = $("phantomConnectDetail");
  const diagnostics = $("phantomDiagnostics");

  if (found) {
    title.textContent = "Phantom đã được phát hiện — cần cấp quyền kết nối";
    detail.textContent = phantomLastError || "Nhấn nút bên phải, sau đó chấp nhận trong cửa sổ Phantom.";
  } else {
    title.textContent = "Chưa phát hiện Phantom trong trình duyệt này";
    detail.textContent = "Hãy mở đúng Chrome profile có cài Phantom, không dùng cửa sổ ẩn danh nếu extension bị tắt.";
  }

  diagnostics.textContent =
    `Provider: ${found ? "FOUND" : phantomDetectionState.toUpperCase()} · ` +
    `Origin: ${location.origin} · ` +
    `isConnected: ${Boolean(getPhantomProvider()?.isConnected)} · ` +
    `Error: ${phantomLastError || "none"}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function executeRealInstantTrade(payload) {
  if (!walletState.connected || !walletState.address) {
    setInstantMessage("Hãy kết nối Phantom trước.", "error");
    return connectPhantom(true);
  }
  if (!window.solanaWeb3?.VersionedTransaction) {
    return setInstantMessage("Không tải được thư viện Solana Web3. Kiểm tra mạng rồi tải lại trang.", "error");
  }

  realTradeBusy = true;
  setInstantBusy(true);
  setInstantMessage("Đang lấy transaction Jupiter mới nhất…", "warning");
  try {
    const orderPayload = {
      ...payload,
      ...(payload.side === "buy" ? instantToken : {}),
      wallet: walletState.address,
      tokenAddress: payload.tokenAddress || instantToken?.tokenAddress,
      slippageBps: Number($("instantSlippage").value || 100)
    };
    const order = await apiPost("/api/real/order", orderPayload);
    instantLastQuote = {
      side: payload.side,
      tokenAddress: order.quote?.tokenAddress || orderPayload.tokenAddress,
      priceImpactPct: order.quote?.priceImpactPct || 0,
      gasSol: Number(order.quote?.estimatedFeeSol || 0),
      requiredSol: Number(order.quote?.requiredSol || 0),
      availableSol: Number(order.quote?.availableSol || 0)
    };
    renderInstantPanel();

    setInstantMessage("Phantom đang chờ bạn kiểm tra và ký giao dịch REAL…", "warning");
    const transaction = window.solanaWeb3.VersionedTransaction.deserialize(base64ToBytes(order.transaction));
    const signed = await phantomProvider.signTransaction(transaction);
    const signedTransaction = bytesToBase64(signed.serialize());

    const selfPay = order.executionMode === "rpc-self-pay";
    setInstantMessage(
      selfPay
        ? "Đã ký. Đang mô phỏng lần cuối; chỉ gửi khi transaction hợp lệ…"
        : "Đã ký. Jupiter đang gửi và xác nhận transaction…",
      "warning"
    );
    const result = await apiPost(
      selfPay ? "/api/real/send-raw" : "/api/real/execute",
      {
        wallet: walletState.address,
        requestId: order.requestId,
        signedTransaction
      }
    );

    setInstantMessage(`${result.trade?.type || "REAL"} ${result.trade?.symbol || ""} thành công · ${shortMint(result.execution?.signature)}`, "success");
    toast(`REAL ${result.trade?.type || ""} thành công`);
    await loadRealPortfolio(true);
    if (result.explorerUrl) window.open(result.explorerUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    const message = error?.code === 4001 ? "Bạn đã từ chối ký trong Phantom." : error.message;
    if (error.code === "SELF_PAY_INSUFFICIENT_SOL") {
      const d = error.details || {};
      const logs = Array.isArray(d.logs) ? d.logs : [];
      const wsol = Number(d.gasContext?.wsolUpfrontRentSol || d.orderFees?.wsolUpfrontRentLamports / 1e9 || 0);
      const ata = Number(d.gasContext?.outputAtaRentSol || d.orderFees?.outputAtaRentLamports / 1e9 || 0);
      const extra = [
        ata > 0 ? `ATA ${ata.toFixed(6)} SOL` : "",
        wsol > 0 ? `WSOL tạm ${wsol.toFixed(6)} SOL (được hoàn lại)` : ""
      ].filter(Boolean).join(" · ");
      setInstantMessage(`${message}${extra ? ` · ${extra}` : ""}`, "error");
      toast("Không đủ SOL tại bước mô phỏng; transaction chưa được gửi");
      console.error("Self-pay simulation logs:", logs);
    } else if (error.code === "SELF_PAY_INSUFFICIENT_TOKEN") {
      setInstantMessage(message, "error");
      toast("Số dư token đã thay đổi; tải lại và lấy quote mới");
    } else if (error.code === "SELF_PAY_SIMULATION_FAILED") {
      setInstantMessage(`${message} Mở Console để xem simulation logs.`, "error");
      console.error("Self-pay simulation details:", error.details);
      toast("Transaction không vượt qua mô phỏng và chưa được gửi");
    } else if (error.code === "SELF_PAY_SIMULATION_RPC_FAILED") {
      setInstantMessage(message, "error");
      toast("RPC tạm thời không mô phỏng được transaction");
    } else if (error.code === "JUPITER_GASLESS_MINIMUM") {
      const d = error.details || {};
      const topUp = Number(d.suggestedTopUpSol || d.shortfallSol || 0);
      const ata = d.ataExists
        ? "Ví đã có token account."
        : `Token mới cần khoảng ${Number(d.ataRentSol || 0).toFixed(6)} SOL tiền rent.`;
      const text =
        `Lệnh dưới mức gasless $${Number(d.gaslessMinimumUsd || 5).toFixed(2)}. ` +
        `Có ${Number(d.availableSol || 0).toFixed(6)} SOL; tự trả cần khoảng ${Number(d.requiredSelfPaySol || 0).toFixed(6)} SOL. ` +
        `${ata} Nên nạp thêm khoảng ${topUp.toFixed(6)} SOL.`;
      setInstantMessage(text, "error");
      toast("Không đủ điều kiện gasless hoặc tự trả gas");
    } else if (error.code === "REAL_SELF_PAY_FALLBACK_FAILED") {
      setInstantMessage(`${message} Hãy nạp thêm SOL hoặc tăng giá trị lệnh.`, "error");
      toast("Self-pay fallback không build được giao dịch");
    } else if (error.code === "JUPITER_NO_ROUTE") {
      const probe = error.details?.routeProbe;
      const suffix = probe?.ok
        ? " Hãy tăng mức SOL mua hoặc thử lại sau."
        : " Token vẫn có thể hiện trên DEX nhưng hiện chưa trade REAL được qua Jupiter.";
      setInstantMessage(`${message}${suffix}`, "error");
      toast("Jupiter chưa có route cho token/mức lệnh này");
    } else if (error.code === "TOKEN_ADDRESS_NOT_MINT") {
      setInstantMessage(`${message} Hãy copy CA và kiểm tra lại mint.`, "error");
      toast("Scanner đang giữ nhầm địa chỉ pair/pool");
    } else {
      setInstantMessage(message, "error");
      toast(`REAL: ${message}`);
    }
  } finally {
    realTradeBusy = false;
    setInstantBusy(false);
  }
}
function restoreInstantToken() { try { const saved=JSON.parse(localStorage.getItem("instantToken")||"null"); if(saved?.tokenAddress) instantToken=saved; } catch{} }


function updateModeControls() {
  $("paperModeButton")?.classList.toggle("active", tradeMode === "paper");
  $("realModeButton")?.classList.toggle("active", tradeMode === "real");
  const button = $("phantomButton");
  if (button) {
    button.classList.toggle("connected", walletState.connected);
    button.textContent = walletState.connected ? `👻 ${shortMint(walletState.address)}` : "👻 Kết nối Phantom";
  }
  if ($("depositButton")) $("depositButton").textContent = tradeMode === "real" ? "＋ Nạp vào Phantom" : "＋ Nạp $";
  if ($("paperScrollButton")) $("paperScrollButton").textContent = tradeMode === "real" ? "Ví Phantom" : "Ví thử";
  updatePhantomConnectPanel();
}

async function connectPhantom(forceMode = false, onlyIfTrusted = false) {
  phantomLastError = null;
  phantomDetectionState = "checking";
  updatePhantomConnectPanel();

  phantomProvider = await waitForPhantomProvider(onlyIfTrusted ? 1200 : 4000);
  if (!phantomProvider) {
    phantomLastError = "Không thấy provider Phantom. Hãy dùng HTTPS Railway hoặc localhost và kiểm tra extension Phantom.";
    updatePhantomConnectPanel();
    if (!onlyIfTrusted) toast(phantomLastError);
    return false;
  }

  try {
    let response = null;

    // If the provider is already connected, reuse its public key immediately.
    if (phantomProvider.isConnected && phantomProvider.publicKey) {
      response = { publicKey: phantomProvider.publicKey };
    } else if (typeof phantomProvider.connect === "function") {
      response = await phantomProvider.connect(
        onlyIfTrusted ? { onlyIfTrusted: true } : undefined
      );
    } else if (typeof phantomProvider.request === "function") {
      response = await phantomProvider.request({
        method: "connect",
        ...(onlyIfTrusted ? { params: { onlyIfTrusted: true } } : {})
      });
    } else {
      throw new Error("Provider Phantom không có phương thức connect()");
    }

    const address = connectedPublicKey(phantomProvider, response);
    if (!address) throw new Error("Phantom đã phản hồi nhưng không trả public key Solana");

    walletState = { connected: true, address };
    phantomLastError = null;
    if (forceMode) tradeMode = "real";
    localStorage.setItem("tradeMode", tradeMode);
    bindPhantomEvents();
    updateModeControls();
    updatePhantomConnectPanel();

    // Show SOL as soon as possible, then load the full token portfolio.
    await loadRealQuickBalance(true);
    loadRealPortfolio(true);
    renderRealAccount();
    return true;
  } catch (error) {
    phantomLastError = phantomErrorText(error);
    if (!onlyIfTrusted) toast(phantomLastError);
    updatePhantomConnectPanel();
    return false;
  }
}
let phantomEventsBound = false;
function bindPhantomEvents() {
  if (!phantomProvider || phantomEventsBound) return;
  phantomEventsBound = true;
  phantomProvider.on?.("connect", publicKey => {
    const address = connectedPublicKey(phantomProvider, { publicKey });
    if (address) {
      walletState = { connected: true, address };
      phantomLastError = null;
      updateModeControls();
      updatePhantomConnectPanel();
      loadRealQuickBalance(true);
      loadRealQuickBalance(true);
      loadRealPortfolio(true);
    }
  });
  phantomProvider.on?.("accountChanged", publicKey => {
    if (publicKey) {
      walletState = { connected: true, address: publicKey.toString() };
      loadRealPortfolio(true);
    } else {
      walletState = { connected: false, address: null };
      realPortfolio = null;
      renderPaper();
    }
  });
  phantomProvider.on?.("disconnect", () => {
    walletState = { connected: false, address: null };
    realPortfolio = null;
    updateModeControls();
    if (tradeMode === "real") renderRealAccount(); else renderPaper();
  });
}

async function disconnectPhantom() {
  try { await phantomProvider?.disconnect?.(); } catch {}
  walletState = { connected: false, address: null };
  realPortfolio = null;
  clearTimeout(realPortfolioTimer);
  clearTimeout(realBalanceTimer);
  realQuickBalance = null;
  updateModeControls();
  updatePhantomConnectPanel();
}

async function setTradeMode(mode) {
  if (!["paper", "real"].includes(mode)) return;
  if (mode === "real") {
    tradeMode = "real";
    localStorage.setItem("tradeMode", "real");
    $("instantArmed").checked = false;
    setInstantMessage("REAL đang khóa. Kết nối Phantom rồi bật ON để giao dịch thật.", "warning");
    updateModeControls();
    renderPaper();
    if (!walletState.connected) {
      const connected = await connectPhantom(true);
      if (!connected) updatePhantomConnectPanel();
    } else {
      await loadRealQuickBalance(true);
      await loadRealPortfolio(true);
    }
  } else {
    tradeMode = "paper";
    localStorage.setItem("tradeMode", "paper");
    await disconnectPhantom();
    $("instantArmed").checked = localStorage.getItem("instantArmed") !== "false";
    setInstantMessage("Đã chuyển về PAPER. Phantom đã ngắt kết nối.", "success");
    renderPaper();
  }
}


async function loadRealQuickBalance(force = false) {
  clearTimeout(realBalanceTimer);
  if (tradeMode !== "real" || !walletState.connected || !walletState.address) return;

  try {
    const response = await fetch(
      `/api/real/balance?wallet=${encodeURIComponent(walletState.address)}`,
      { cache: "no-store" }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    realQuickBalance = data;
    renderRealAccount();
  } catch (error) {
    phantomLastError = `RPC số dư: ${error.message}`;
    updatePhantomConnectPanel();
    if (force) toast(`Đọc số dư SOL: ${error.message}`);
    if (tradeMode === "real") {
      $("paperStatus").innerHTML = `<span class="status-dot bad"></span> ${escapeHtml(error.message)} · kiểm tra <code>/api/real/rpc-health</code>`;
    }
  } finally {
    realBalanceTimer = setTimeout(() => loadRealQuickBalance(false), 1000);
  }
}

async function loadRealPortfolio(force = false) {
  clearTimeout(realPortfolioTimer);
  if (tradeMode !== "real" || !walletState.connected || !walletState.address) return;
  try {
    const response = await fetch(`/api/real/portfolio?wallet=${encodeURIComponent(walletState.address)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    realPortfolio = data;
    renderRealAccount();
  } catch (error) {
    if (force) toast(`Ví Phantom: ${error.message}`);
  } finally {
    realPortfolioTimer = setTimeout(() => loadRealPortfolio(false), Math.max(2500, Number(realPortfolio?.config?.walletPollMs || 3000)));
  }
}


async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    const detail = data.error || raw.replace(/\s+/g, " ").trim().slice(0, 500) || `HTTP ${response.status}`;
    const error = new Error(detail);
    error.code = data.code || `HTTP_${response.status}`;
    error.details = data.details || null;
    error.status = response.status;
    throw error;
  }
  if (!data || typeof data !== "object") throw new Error("Server trả về dữ liệu quote không hợp lệ");
  return data;
}
async function loadPaper(silent = false) {
  try {
    const response = await fetch("/api/paper", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    paper = data; renderPaper();
  } catch (error) { if (!silent) toast(`Ví thử: ${error.message}`); }
}
async function loadWatchlist() { try { const r = await fetch("/api/watchlist"); const data = await r.json(); watchlist = new Set((data.items || []).map(x => x.tokenAddress)); } catch {} }
async function toggleWatch(button) {
  try {
    const data = await apiPost("/api/watchlist", { tokenAddress: button.dataset.address, symbol: button.dataset.symbol, name: button.dataset.name });
    watchlist = new Set((data.items || []).map(x => x.tokenAddress)); toast(data.watched ? "Đã thêm vào danh sách theo dõi" : "Đã bỏ khỏi danh sách"); renderScanner();
  } catch (e) { toast(`Lỗi: ${e.message}`); }
}


function hiddenMemeItems() {
  return [...hiddenMemes.values()].sort((a, b) => Number(b.hiddenAt || 0) - Number(a.hiddenAt || 0));
}

async function loadHiddenMemes() {
  try {
    const response = await fetch("/api/hidden-memes", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    hiddenMemes = new Map((data.items || []).map(item => [item.tokenAddress, item]));
    if ($("hiddenMemesCount")) $("hiddenMemesCount").textContent = hiddenMemes.size;
  } catch (error) {
    toast(`Meme đang ẩn: ${error.message}`);
  }
}

async function hideMeme(token) {
  if (!token?.tokenAddress) return toast("Không đọc được contract của meme");
  try {
    const data = await apiPost("/api/hidden-memes", {
      action: "hide",
      tokenAddress: token.tokenAddress,
      symbol: token.symbol,
      name: token.name,
      pairAddress: token.pairAddress,
      dexId: token.dexId,
      priceUsd: token.priceUsd,
      marketCap: token.marketCap,
      liquidityUsd: token.liquidityUsd
    });
    hiddenMemes = new Map((data.items || []).map(item => [item.tokenAddress, item]));
    renderScanner();
    renderHiddenMemes();
    toast(`Đã ẩn ${token.symbol || shortMint(token.tokenAddress)}`);
  } catch (error) {
    toast(`Không ẩn được meme: ${error.message}`);
  }
}

async function restoreHiddenMeme(tokenAddress) {
  try {
    const item = hiddenMemes.get(tokenAddress);
    const data = await apiPost("/api/hidden-memes", {
      action: "unhide",
      tokenAddress
    });
    hiddenMemes = new Map((data.items || []).map(entry => [entry.tokenAddress, entry]));
    renderScanner();
    renderHiddenMemes();
    toast(`Đã mở lại ${item?.symbol || shortMint(tokenAddress)}`);
  } catch (error) {
    toast(`Không mở lại được meme: ${error.message}`);
  }
}

async function restoreAllHiddenMemes() {
  if (!hiddenMemes.size) return;
  if (!confirm(`Mở lại toàn bộ ${hiddenMemes.size} meme đang ẩn?`)) return;
  try {
    const data = await apiPost("/api/hidden-memes", { action: "unhide_all" });
    hiddenMemes = new Map((data.items || []).map(item => [item.tokenAddress, item]));
    renderScanner();
    renderHiddenMemes();
    toast("Đã mở lại toàn bộ meme");
  } catch (error) {
    toast(`Không mở lại được: ${error.message}`);
  }
}

function hiddenMemeLiveData(item) {
  const live = state?.tokens?.find(token => token.tokenAddress === item.tokenAddress);
  return live ? { ...item, ...live, hiddenAt: item.hiddenAt } : item;
}

function renderHiddenMemes() {
  if (!$("hiddenMemesList")) return;
  const query = String($("hiddenMemesSearch")?.value || "").trim().toLowerCase();
  const all = hiddenMemeItems();
  const items = all
    .map(hiddenMemeLiveData)
    .filter(item => !query || `${item.symbol} ${item.name} ${item.tokenAddress}`.toLowerCase().includes(query));

  $("hiddenMemesCount").textContent = all.length;
  $("hiddenMemesSummary").textContent = `${all.length} meme đang ẩn · ${items.length} kết quả`;
  $("restoreAllHiddenMemes").disabled = all.length === 0;

  if (!items.length) {
    $("hiddenMemesList").innerHTML = `<div class="paper-empty">${all.length ? "Không tìm thấy meme phù hợp." : "Chưa ẩn meme nào."}</div>`;
    return;
  }

  $("hiddenMemesList").innerHTML = items.map(item => {
    const gmgn = `https://gmgn.ai/sol/token/${encodeURIComponent(item.tokenAddress)}`;
    const dex = `https://dexscreener.com/solana/${encodeURIComponent(item.pairAddress || item.tokenAddress)}`;
    const age = item.hiddenAt ? new Date(item.hiddenAt).toLocaleString("vi-VN") : "—";
    return `<article class="hidden-meme-item" data-mint="${escapeHtml(item.tokenAddress)}">
      <div class="hidden-meme-main">
        <div class="hidden-meme-symbol">${escapeHtml((item.symbol || "??").slice(0, 3))}</div>
        <div class="hidden-meme-name">
          <strong>${escapeHtml(item.symbol || "???")} <span>${escapeHtml(item.name || "")}</span></strong>
          <code>${escapeHtml(item.tokenAddress)}</code>
          <small>Ẩn lúc ${escapeHtml(age)} · ${escapeHtml(item.dexId || "DEX")}</small>
        </div>
      </div>
      <div class="hidden-meme-market">
        <span>MC hiện tại<strong>${item.marketCap ? fmtMoney(item.marketCap) : "—"}</strong></span>
        <span>Giá<strong>${item.priceUsd ? fmtMoney(item.priceUsd, false) : "—"}</strong></span>
        <span>Thanh khoản<strong>${item.liquidityUsd ? fmtMoney(item.liquidityUsd) : "—"}</strong></span>
      </div>
      <div class="hidden-meme-actions">
        <button class="restore-hidden-meme button primary" data-address="${escapeHtml(item.tokenAddress)}">👁 Mở lại</button>
        <button class="copy-hidden-mint button" data-address="${escapeHtml(item.tokenAddress)}">Copy CA</button>
        <a href="${gmgn}" target="_blank" rel="noreferrer">GMGN ↗</a>
        <a href="${dex}" target="_blank" rel="noreferrer">DEX ↗</a>
      </div>
    </article>`;
  }).join("");
}


function openPopup(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("hidden");
  document.body.classList.add("modal-open");
  if (id === "profileModal") renderProfilePopup();
  if (id === "historyModal") renderFullHistory();
  if (id === "pnlModal") renderPnlCalendar();
  if (id === "hiddenMemesModal") renderHiddenMemes();
}
function closePopup(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
  if (!["profileModal","depositModal","historyModal","pnlModal","hiddenMemesModal","tradeModal","instantPresetModal"].some(x => !$(x)?.classList.contains("hidden"))) document.body.classList.remove("modal-open");
}
function renderProfilePopup() {
  if (!paper || !$("profileActiveName") || $("profileModal")?.classList.contains("hidden")) return;
  const active = paper.profile || {};
  const store = paper.profiles || { profiles: [] };
  $("profileActiveName").textContent = active.name || "Profile";
  $("profileActiveCode").textContent = active.code || "—";
  $("profileDataPath").textContent = `Lưu bền vững: ${store.dataRoot || "thư mục người dùng"}`;
  if (document.activeElement !== $("renameProfileInput")) $("renameProfileInput").value = active.name || "";
  $("profileList").innerHTML = (store.profiles || []).map(profile => `
    <button class="profile-list-item ${profile.active ? "active" : ""}" data-profile-id="${escapeHtml(profile.id)}">
      <span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.code)} · ${new Date(profile.updatedAt || profile.createdAt).toLocaleString("vi-VN")}</small></span>
      <b>${profile.active ? "Đang dùng" : "Mở"}</b>
    </button>`).join("") || `<div class="paper-empty">Chưa có profile.</div>`;
}
function setProfileTab(name) {
  document.querySelectorAll("[data-profile-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.profileTab === name));
  ["list","create","recover"].forEach(tab => $(`profileTab${tab[0].toUpperCase()}${tab.slice(1)}`)?.classList.toggle("hidden", tab !== name));
}
async function switchPaperProfile(payload) {
  const data = await apiPost("/api/profiles/switch", payload);
  paper = data.paper;
  watchlist = new Set((data.watchlist || []).map(x => x.tokenAddress));
  hiddenMemes = new Map((data.hiddenMemes || []).map(x => [x.tokenAddress, x]));
  instantToken = null;
  localStorage.removeItem("instantToken");
  renderPaper();
  toast(`Đã mở profile ${data.profile.name}`);
}
function historyCutoff(range) {
  const now = Date.now();
  if (range === "day") { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  if (range === "week") return now - 7 * 86400000;
  if (range === "month") return now - 30 * 86400000;
  return 0;
}
function filteredHistory() {
  const cutoff = historyCutoff(historyRange);
  return (activeAccount()?.trades || []).filter(t => t.createdAt >= cutoff && (historyType === "all" || t.type === historyType));
}
function renderFullHistory() {
  if (!activeTradingView() || !$("fullHistoryList") || $("historyModal")?.classList.contains("hidden")) return;
  const trades = filteredHistory();
  const sells = trades.filter(t => t.type === "SELL");
  const realized = sells.reduce((sum,t) => sum + Number(t.pnlUsd || 0), 0);
  const fees = trades.reduce((sum,t) => sum + Number(t.quote?.gas?.totalUsd || 0), 0);
  const wins = sells.filter(t => Number(t.pnlUsd || 0) > 0).length;
  $("historyCount").textContent = trades.length;
  $("historyRealized").textContent = `${realized > 0 ? "+" : ""}${fmtMoney(realized, false, 2)}`;
  $("historyRealized").className = pnlClass(realized);
  $("historyFees").textContent = fmtMoney(fees, false, 4);
  $("historyWinRate").textContent = `${sells.length ? fmtNum(wins / sells.length * 100, 1) : 0}%`;
  $("fullHistoryList").innerHTML = trades.length ? trades.map(t => `<div class="full-history-item">${tradeRow(t)}</div>`).join("") : `<div class="paper-empty">Không có giao dịch trong khoảng này.</div>`;
  document.querySelectorAll("[data-history-range]").forEach(btn => btn.classList.toggle("active", btn.dataset.historyRange === historyRange));
  if ($("historyTypeFilter")) $("historyTypeFilter").value = historyType;
}
function localDateKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dailyPnlMap() {
  const map = new Map();
  for (const trade of activeAccount()?.trades || []) {
    if (trade.type !== "SELL") continue;
    const key = localDateKey(trade.createdAt);
    const row = map.get(key) || { pnl: 0, trades: 0, wins: 0, losses: 0 };
    row.pnl += Number(trade.pnlUsd || 0); row.trades++;
    if (Number(trade.pnlUsd || 0) > 0) row.wins++; else if (Number(trade.pnlUsd || 0) < 0) row.losses++;
    map.set(key, row);
  }
  return map;
}
function sumPnlSince(map, from, to = Date.now()) {
  let total = 0;
  for (const [key,row] of map) { const ts = new Date(`${key}T00:00:00`).getTime(); if (ts >= from && ts <= to) total += row.pnl; }
  return total;
}
function pnlStreaks(map) {
  const positive = [...map.entries()].filter(([,r]) => r.pnl > 0).map(([k]) => k).sort();
  if (!positive.length) return { current: 0, best: 0, bestDay: null };
  let best = 0, run = 0, prev = null;
  for (const key of positive) {
    const ts = new Date(`${key}T00:00:00`).getTime();
    run = prev !== null && ts - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run); prev = ts;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  let cursor = today.getTime(), current = 0;
  while (map.get(localDateKey(cursor))?.pnl > 0) { current++; cursor -= 86400000; }
  if (!current) { cursor = today.getTime() - 86400000; while (map.get(localDateKey(cursor))?.pnl > 0) { current++; cursor -= 86400000; } }
  const bestDay = [...map.entries()].sort((a,b) => b[1].pnl - a[1].pnl)[0] || null;
  return { current, best, bestDay };
}
function renderPnlCalendar() {
  if (!activeTradingView() || !$("pnlCalendar") || $("pnlModal")?.classList.contains("hidden")) return;
  const map = dailyPnlMap();
  const year = pnlCursor.getFullYear(), month = pnlCursor.getMonth();
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  $("pnlMonthTitle").textContent = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(first);
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i=0;i<mondayOffset;i++) cells.push(`<div class="pnl-day outside"></div>`);
  let monthPnl = 0;
  for (let day=1;day<=last.getDate();day++) {
    const date = new Date(year, month, day);
    const key = localDateKey(date.getTime());
    const row = map.get(key) || { pnl: 0, trades: 0 };
    monthPnl += row.pnl;
    const cls = row.pnl > 0 ? "profit" : row.pnl < 0 ? "loss" : "flat";
    cells.push(`<button class="pnl-day ${cls}" data-pnl-date="${key}"><span>${day}</span><strong>${row.pnl ? `${row.pnl > 0 ? "+" : ""}${fmtMoney(row.pnl, true, 2)}` : "$0"}</strong><small>${row.trades ? `${row.trades} lệnh` : ""}</small></button>`);
  }
  while (cells.length % 7) cells.push(`<div class="pnl-day outside"></div>`);
  $("pnlCalendar").innerHTML = cells.join("");
  const today = new Date(); today.setHours(0,0,0,0);
  const todayPnl = map.get(localDateKey(today.getTime()))?.pnl || 0;
  const weekPnl = sumPnlSince(map, today.getTime() - 6 * 86400000, today.getTime() + 86399999);
  const allPnl = [...map.values()].reduce((sum,row) => sum + row.pnl, 0);
  [["pnlTodayValue",todayPnl],["pnlWeekValue",weekPnl],["pnlMonthValue",monthPnl],["pnlAllValue",allPnl]].forEach(([id,val]) => { $(id).textContent = `${val > 0 ? "+" : ""}${fmtMoney(val, false, 2)}`; $(id).className = pnlClass(val); });
  const streak = pnlStreaks(map);
  $("currentWinStreak").textContent = `${streak.current} ngày`;
  $("bestWinStreak").textContent = `${streak.best} ngày`;
  $("bestPnlDay").textContent = streak.bestDay ? `${streak.bestDay[0]} · +${fmtMoney(streak.bestDay[1].pnl, false, 2)}` : "—";
}

function paperSettings(payload) {
  return { ...payload, slippageBps: Number($("paperSlippage").value), fillMode: $("paperFillMode").value };
}
async function openPaperOrder(payload) {
  pendingOrderPayload = paperSettings(payload);
  latestQuote = null;
  $("tradeModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  $("quoteLoading").classList.remove("hidden");
  $("quoteContent").classList.add("hidden");
  $("quoteError").classList.add("hidden");
  $("modalTitle").textContent = titleForSide(payload.side, payload);
  try {
    const data = await apiPost("/api/paper/quote", pendingOrderPayload);
    latestQuote = data.quote;
    renderQuote(data.quote);
  } catch (error) {
    $("quoteLoading").classList.add("hidden");
    const box = $("quoteError");
    box.classList.remove("hidden");
    box.innerHTML = `<strong>Không lấy được quote · v2.5</strong><br>${escapeHtml(error.message)}<br><small>Trang phải được mở bằng HTTPS Railway hoặc localhost</small>`;
  }
}
function titleForSide(side, payload) {
  if (side === "buy") return `Mua thử ${payload.symbol || "token"}`;
  if (side === "sell") return `Bán thử ${payload.percent}% vị thế`;
  return side === "usd_to_sol" ? "Đổi USD ảo sang SOL ảo" : "Đổi SOL ảo sang USD ảo";
}
function quoteUnits(q) {
  const inputSymbol = q.inputMint.includes("So111") ? "SOL" : q.inputMint.includes("EPjF") ? "USDC" : q.token?.symbol || "TOKEN";
  const outputSymbol = q.outputMint.includes("So111") ? "SOL" : q.outputMint.includes("EPjF") ? "USDC" : q.token?.symbol || "TOKEN";
  return { inputSymbol, outputSymbol };
}
function renderQuote(q) {
  const u = quoteUnits(q);
  $("quoteLoading").classList.add("hidden"); $("quoteContent").classList.remove("hidden");
  $("quotePay").textContent = `${fmtToken(q.inputUi)} ${u.inputSymbol}`;
  $("quoteReceive").textContent = `${fmtToken(q.fillOutputUi)} ${u.outputSymbol}`;
  $("quoteInUsd").textContent = fmtMoney(q.inUsdValue, false, 4);
  $("quoteOutUsd").textContent = q.outUsdValue ? fmtMoney(q.outUsdValue, false, 4) : "Nằm trong quote";
  $("quoteImpact").innerHTML = `<span class="${q.priceImpactPct > 3 ? "negative" : q.priceImpactPct < 1 ? "positive" : ""}">${fmtNum(q.priceImpactPct, 3)}%</span>`;
  $("quoteSlippage").textContent = `${fmtNum(q.slippageBps / 100, 2)}% · ${fillLabel(q.fillMode)}`;
  $("quoteGas").textContent = q.gas.sponsored ? "Được tài trợ" : `${fmtNum(q.gas.totalSol, 7)} SOL (${fmtMoney(q.gas.totalUsd, false, 5)})`;
  $("quotePlatformFee").textContent = `${fmtNum(q.platformFee.feeBps / 100, 2)}% · đã nằm trong quote`;
  $("quoteMinimum").textContent = `${fmtToken(q.minimumOutputUi)} ${u.outputSymbol}`;
  $("quoteRouter").textContent = `${q.quoteSource || "Nguồn quote"} · ${q.router} · ${q.routes.join(" + ") || "route tự động"}`;
  const fallbackNotice = q.approximation
    ? `<strong style="color:#f4ca64">DEX fallback:</strong> Jupiter chưa có route hoặc không dùng được. Khớp lệnh được tính từ giá và thanh khoản pool hiện tại. ${q.fallbackReason ? `<br><span style="color:#777">${escapeHtml(q.fallbackReason)}</span>` : ""}<br>`
    : "";
  $("quoteRoute").innerHTML = `${fallbackNotice}Phí mạng${q.gas.estimated ? " ước tính" : ""}: chữ ký ${q.gas.signatureLamports.toLocaleString()} + priority ${q.gas.priorityLamports.toLocaleString()} + rent ${q.gas.rentLamports.toLocaleString()} lamports.`;
}
function fillLabel(mode) { return mode === "quote" ? "giá quote" : mode === "worst" ? "mức xấu nhất" : "mức trung bình"; }
function closeModal() { $("tradeModal").classList.add("hidden"); document.body.classList.remove("modal-open"); pendingOrderPayload = null; latestQuote = null; }

async function executePendingTrade() {
  if (!pendingOrderPayload) return;
  const button = $("confirmPaperTrade"); button.disabled = true; button.textContent = "Đang khớp lệnh ảo…";
  try {
    const result = await apiPost("/api/paper/trade", pendingOrderPayload);
    paper = result.paper; renderPaper(); closeModal();
    const t = result.trade;
    toast(`${t.type}: ${t.symbol || ""}${t.pnlUsd ? ` · PnL ${fmtMoney(t.pnlUsd, false, 2)}` : ""}`);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = "Xác nhận giao dịch ảo"; }
}

function toast(text) { const el = $("toast"); el.textContent = text; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 3200); }

async function init() {
  loadFilters();
  restoreInstantToken();
  $("instantSlippage").value = localStorage.getItem("instantSlippage") || localStorage.getItem("paperSlippage") || "100";
  $("instantFillMode").value = localStorage.getItem("instantFillMode") || localStorage.getItem("paperFillMode") || "mid";
  $("instantHotkeys").checked = localStorage.getItem("instantHotkeys") === "true";
  $("instantArmed").checked = tradeMode === "real" ? false : localStorage.getItem("instantArmed") !== "false";
  await Promise.all([loadWatchlist(), loadHiddenMemes(), loadPaper(), loadInstantProfiles()]);
  phantomProvider = await waitForPhantomProvider(1500);
  updateModeControls();
  updatePhantomConnectPanel();
  if (tradeMode === "real") {
    const eagerConnected = await connectPhantom(false, true);
    if (!eagerConnected) updatePhantomConnectPanel();
  }
  pnlCursor = new Date();
  try { const r = await fetch("/api/state"); state = await r.json(); renderScanner(); } catch (e) { toast(`Không kết nối server: ${e.message}`); }
  const stream = new EventSource("/api/stream");
  stream.addEventListener("scan", event => { state = JSON.parse(event.data); renderScanner(); });
  stream.addEventListener("ticker", event => {
    const update = JSON.parse(event.data);
    fastTickerReceivedAt = update.updatedAt || Date.now();
    if (state) { state.tokens = update.tokens || state.tokens; state.config = { ...(state.config || {}), fastTickerUpdatedAt: fastTickerReceivedAt }; }
    if (update.paper) {
      const priorTrades = paper?.account?.trades || [];
      paper = update.paper;
      if (priorTrades.length > (paper.account?.trades?.length || 0)) paper.account.trades = priorTrades;
    }
    const pill = $("fastTickerPill"); if (pill) { pill.className = "pill fast ok"; pill.innerHTML = `<span></span>Giá/MC ${Math.max(0, Math.round((Date.now()-fastTickerReceivedAt)/1000))}s`; }
    renderPaper();
  });
  stream.addEventListener("ticker_error", event => { const data=JSON.parse(event.data); const pill=$("fastTickerPill"); if(pill){pill.className="pill error";pill.innerHTML=`<span></span>Giá nhanh lỗi`; } });
  stream.onerror = () => { const pill = $("connectionPill"); pill.className = "pill error"; pill.innerHTML = "<span></span>Mất kết nối"; };
  countdownTimer = setInterval(() => { if (!state?.nextScanAt) return $("countdown").textContent = "--"; $("countdown").textContent = `${Math.max(0, Math.ceil((state.nextScanAt - Date.now()) / 1000))}s`; }, 250);
}



$("walletConnectButton").addEventListener("click", () => connectPhantom(true, false));
$("walletRetryButton").addEventListener("click", async () => {
  phantomLastError = null;
  phantomDetectionState = "checking";
  updatePhantomConnectPanel();
  const provider = await waitForPhantomProvider(4000);
  if (provider) {
    toast("Đã phát hiện Phantom. Nhấn Kết nối Phantom ngay.");
  } else {
    toast("Vẫn chưa thấy Phantom trong browser profile này.");
  }
  updatePhantomConnectPanel();
});

$("paperModeButton").addEventListener("click", () => setTradeMode("paper"));
$("realModeButton").addEventListener("click", () => setTradeMode("real"));
$("phantomButton").addEventListener("click", async () => {
  if (walletState.connected) {
    if (confirm("Ngắt kết nối Phantom khỏi trang này?")) await disconnectPhantom();
  } else {
    await connectPhantom(tradeMode === "real", false);
  }
});

$("scanButton").addEventListener("click", () => fetch("/api/scan", { method: "POST" }).catch(e => toast(e.message)));
$("paperScrollButton").addEventListener("click", () => $("paperWallet").scrollIntoView({ behavior: "smooth", block: "start" }));
$("preset").addEventListener("change", e => applyPreset(e.target.value));
$("resetButton").addEventListener("click", () => { $("preset").value = "balanced"; applyPreset("balanced"); });
$("paperSlippage").addEventListener("change", e => localStorage.setItem("paperSlippage", e.target.value));
$("paperFillMode").addEventListener("change", e => localStorage.setItem("paperFillMode", e.target.value));
$("resetPaperButton").addEventListener("click", async () => {
  if (tradeMode === "real") return toast("Reset chỉ áp dụng cho ví ảo.");
  const initialUsd = Number(prompt("Vốn paper mới (USD):", "100")); if (!Number.isFinite(initialUsd) || initialUsd < 10) return;
  const solPct = Number(prompt("Bao nhiêu % vốn đổi thành SOL ảo?", "90")); if (!Number.isFinite(solPct)) return;
  if (!confirm("Reset sẽ xóa toàn bộ vị thế và lịch sử paper. Tiếp tục?")) return;
  try { const data = await apiPost("/api/paper/reset", { initialUsd, solPct }); paper = data.paper; renderPaper(); toast("Đã reset ví paper"); } catch (e) { toast(e.message); }
});
$("confirmPaperTrade").addEventListener("click", executePendingTrade);
document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", closeModal));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

for (const id of fields) {
  const el = $(id); if (!el) continue;
  el.addEventListener(["searchInput", "minMemeScore"].includes(id) ? "input" : "change", () => {
    if (id !== "searchInput" && id !== "sortSelect") $("preset").value = "custom";
    if (id === "minMemeScore") $("memeScoreValue").textContent = el.value;
    saveFilters(); renderScanner();
  });
}


$("instantPanelButton").addEventListener("click",()=>{$("instantTradePanel").classList.remove("closed","collapsed");renderInstantPanel();});
$("instantClose").addEventListener("click",()=>$("instantTradePanel").classList.add("closed"));
$("instantCollapse").addEventListener("click",()=>$("instantTradePanel").classList.toggle("collapsed"));
$("instantArmed").addEventListener("change",e=>{
  if (tradeMode === "real" && e.target.checked) {
    const accepted = confirm("BẬT REAL QUICK TRADE? Mỗi lần bấm Mua/Bán sẽ tạo giao dịch thật và mở Phantom để ký. Hãy kiểm tra token contract trước khi ký.");
    if (!accepted) e.target.checked = false;
  } else {
    localStorage.setItem("instantArmed",String(e.target.checked));
  }
  setInstantMessage(e.target.checked ? `Giao dịch ${modeLabel()} một chạm đã bật.` : "Đã khóa giao dịch một chạm.", e.target.checked?"success":"warning");
  renderInstantPanel();
});
$("instantAdvancedToggle").addEventListener("change",e=>$("instantAdvanced").classList.toggle("hidden",!e.target.checked));
$("instantSlippage").addEventListener("change",e=>{localStorage.setItem("instantSlippage",e.target.value);$("paperSlippage").value=e.target.value;localStorage.setItem("paperSlippage",e.target.value);renderInstantPanel();});
$("instantFillMode").addEventListener("change",e=>{localStorage.setItem("instantFillMode",e.target.value);$("paperFillMode").value=e.target.value;localStorage.setItem("paperFillMode",e.target.value);});
$("instantHotkeys").addEventListener("change",e=>localStorage.setItem("instantHotkeys",String(e.target.checked)));
document.querySelectorAll(".instant-profile").forEach(button=>button.addEventListener("click",()=>{instantProfile=button.dataset.profile;localStorage.setItem("instantProfile",instantProfile);renderInstantPanel();}));
$("instantEditProfiles").addEventListener("click",()=>{renderInstantPresetEditor();openPopup("instantPresetModal");});
$("saveInstantPresets").addEventListener("click",()=>saveInstantProfileEditor().catch(error=>toast(error.message)));
$("resetInstantPresets").addEventListener("click",()=>{
  instantProfiles = normalizeInstantProfiles(DEFAULT_INSTANT_PROFILES);
  renderInstantPresetEditor();
});
$("instantBuyButtons").addEventListener("click",event=>{const button=event.target.closest(".instant-buy-button");if(button)executeInstantTrade({side:"buy",amountSol:Number(button.dataset.sol)});});
document.querySelectorAll(".instant-sell-button").forEach(button=>button.addEventListener("click",()=>executeInstantTrade({side:"sell",tokenAddress:instantToken?.tokenAddress,percent:Number(button.dataset.percent)})));
document.addEventListener("keydown",event=>{
  if(!$("instantHotkeys").checked||event.repeat||["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;
  const buyMap={"1":0,"2":1,"3":2,"4":3},sellMap={q:10,w:25,e:50,r:100};
  if(event.key in buyMap){const amount=(INSTANT_PROFILES[instantProfile]||INSTANT_PROFILES.P1)[buyMap[event.key]];executeInstantTrade({side:"buy",amountSol:amount});}
  if(event.key.toLowerCase() in sellMap)executeInstantTrade({side:"sell",tokenAddress:instantToken?.tokenAddress,percent:sellMap[event.key.toLowerCase()]});
});

$("cards").addEventListener("click", async event => {
  const copy = event.target.closest(".copy"); if (copy) { await navigator.clipboard.writeText(copy.dataset.address); return toast("Đã copy contract"); }
  const watch = event.target.closest(".watch"); if (watch) return toggleWatch(watch);
  const hide = event.target.closest(".hide-meme");
  if (hide) {
    let token;
    try { token = JSON.parse(hide.dataset.token); }
    catch { return toast("Không đọc được dữ liệu meme"); }
    return hideMeme(token);
  }
  const select = event.target.closest(".select-instant");
  if (select) { let token; try { token=JSON.parse(select.dataset.token); } catch { return toast("Không đọc được token"); } return selectInstantToken(token); }
  const instantBuy = event.target.closest(".instant-card-buy");
  if (instantBuy) { let token; try { token=JSON.parse(instantBuy.dataset.token); } catch { return toast("Không đọc được token"); } selectInstantToken(token); return executeInstantTrade({side:"buy",amountSol:Number(instantBuy.dataset.sol)}); }
  const buy = event.target.closest(".quick-buy");
  if (buy) {
    let token; try { token = JSON.parse(buy.dataset.token); } catch { return toast("Không đọc được token"); }
    return openPaperOrder({ side: "buy", amountUsd: Number(buy.dataset.usd), ...token });
  }
});
$("paperPositions").addEventListener("click", async event => {
  const copy=event.target.closest(".copy-position-mint");
  if(copy){await navigator.clipboard.writeText(copy.dataset.address);return toast("Đã copy contract");}
  const select=event.target.closest(".instant-position-select");
  if(select){const p=activePositionByMint(select.dataset.address);if(p)selectInstantToken({...p,marketCap:p.currentMarketCap,priceUsd:p.priceUsd,liquidityUsd:state?.tokens?.find(t=>t.tokenAddress===p.tokenAddress)?.liquidityUsd||0,dexId:state?.tokens?.find(t=>t.tokenAddress===p.tokenAddress)?.dexId||"DEX"});return;}
  const sell=event.target.closest(".instant-position-sell");
  if(sell){const p=activePositionByMint(sell.dataset.address);if(p)selectInstantToken({...p,marketCap:p.currentMarketCap,priceUsd:p.priceUsd},false);return executeInstantTrade({side:"sell",tokenAddress:sell.dataset.address,percent:Number(sell.dataset.percent)});}
});
document.querySelectorAll(".convert-button").forEach(button => button.addEventListener("click", () => {
  if (tradeMode === "real") return toast("Đổi vốn trong REAL hãy dùng Quick Trade hoặc Phantom.");
  const amount = Number($("convertAmount").value); if (!(amount > 0)) return toast("Nhập số lượng hợp lệ");
  if (button.dataset.side === "usd_to_sol") openPaperOrder({ side: "usd_to_sol", amountUsd: amount });
  else openPaperOrder({ side: "sol_to_usd", amountSol: amount });
}));


$("profileButton").addEventListener("click", () => openPopup("profileModal"));
$("depositButton").addEventListener("click", () => {
  if (tradeMode === "real") return toast("Hãy nạp SOL/USDC trực tiếp trong Phantom; trang sẽ tự cập nhật số dư.");
  openPopup("depositModal");
});
$("depositPaperButton").addEventListener("click", () => {
  if (tradeMode === "real") return toast("Nạp tài sản thật trực tiếp vào địa chỉ Phantom.");
  openPopup("depositModal");
});
$("historyButton").addEventListener("click", () => openPopup("historyModal"));
$("hiddenMemesButton").addEventListener("click", () => openPopup("hiddenMemesModal"));
$("hiddenMemesSearch").addEventListener("input", renderHiddenMemes);
$("restoreAllHiddenMemes").addEventListener("click", restoreAllHiddenMemes);
$("hiddenMemesList").addEventListener("click", async event => {
  const restore = event.target.closest(".restore-hidden-meme");
  if (restore) return restoreHiddenMeme(restore.dataset.address);
  const copy = event.target.closest(".copy-hidden-mint");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.address);
    return toast("Đã copy contract");
  }
});
$("openFullHistoryInline").addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openPopup("historyModal"); });
$("pnlButton").addEventListener("click", () => openPopup("pnlModal"));
$("openPnlPaperButton").addEventListener("click", () => openPopup("pnlModal"));
document.querySelectorAll("[data-close-popup]").forEach(el => el.addEventListener("click", () => closePopup(el.dataset.closePopup)));
document.querySelectorAll("[data-profile-tab]").forEach(el => el.addEventListener("click", () => setProfileTab(el.dataset.profileTab)));
$("profileList").addEventListener("click", async event => {
  const item = event.target.closest("[data-profile-id]"); if (!item || item.classList.contains("active")) return;
  try { await switchPaperProfile({ id: item.dataset.profileId }); } catch (error) { toast(error.message); }
});
$("copyProfileCode").addEventListener("click", async () => { await navigator.clipboard.writeText(paper?.profile?.code || ""); toast("Đã copy mã profile"); });
$("createProfileButton").addEventListener("click", async () => {
  try {
    const data = await apiPost("/api/profiles/create", { name: $("newProfileName").value, initialUsd: Number($("newProfileUsd").value), solPct: Number($("newProfileSolPct").value) });
    paper = data.paper;
    watchlist = new Set((data.watchlist || []).map(x => x.tokenAddress));
    hiddenMemes = new Map((data.hiddenMemes || []).map(x => [x.tokenAddress, x]));
    instantToken = null; localStorage.removeItem("instantToken"); renderPaper(); setProfileTab("list"); toast(`Đã tạo ${data.profile.name}`);
  } catch (error) { toast(error.message); }
});
$("recoverProfileButton").addEventListener("click", async () => { try { await switchPaperProfile({ code: $("recoverProfileCode").value }); setProfileTab("list"); } catch (error) { toast(error.message); } });
$("renameProfileButton").addEventListener("click", async () => { try { const data = await apiPost("/api/profiles/rename", { name: $("renameProfileInput").value }); paper = data.paper; renderPaper(); toast("Đã đổi tên profile"); } catch (error) { toast(error.message); } });
document.querySelectorAll("[data-deposit]").forEach(button => button.addEventListener("click", () => $("depositAmount").value = button.dataset.deposit));
$("confirmDepositButton").addEventListener("click", async () => {
  const button = $("confirmDepositButton"); button.disabled = true;
  try { const data = await apiPost("/api/paper/deposit", { amount: Number($("depositAmount").value), note: $("depositNote").value }); paper = data.paper; renderPaper(); closePopup("depositModal"); toast("Đã nạp USD ảo"); }
  catch (error) { toast(error.message); } finally { button.disabled = false; }
});
document.querySelectorAll("[data-history-range]").forEach(button => button.addEventListener("click", () => { historyRange = button.dataset.historyRange; renderFullHistory(); }));
$("historyTypeFilter").addEventListener("change", event => { historyType = event.target.value; renderFullHistory(); });
$("pnlPrevMonth").addEventListener("click", () => { pnlCursor = new Date(pnlCursor.getFullYear(), pnlCursor.getMonth()-1, 1); renderPnlCalendar(); });
$("pnlNextMonth").addEventListener("click", () => { pnlCursor = new Date(pnlCursor.getFullYear(), pnlCursor.getMonth()+1, 1); renderPnlCalendar(); });
$("pnlToday").addEventListener("click", () => { pnlCursor = new Date(); renderPnlCalendar(); });
$("pnlCalendar").addEventListener("click", event => { const day = event.target.closest("[data-pnl-date]"); if (!day) return; historyRange = "all"; historyType = "SELL"; openPopup("historyModal"); toast(`PNL ngày ${day.dataset.pnlDate}`); });

init();
