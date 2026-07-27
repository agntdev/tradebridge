import type { Ctx, Session } from "./bot.js";

export type Broker = "binance" | "mt4mt5" | "ib" | "coinbase";
export type Mode = "live" | "paper";
export type OrderType = "market" | "limit";

export interface Account {
  id: string;
  platform: Broker;
  mode: Mode;
  encryptedApiKey: string;
  encryptedApiSecret: string;
}
export interface Order {
  id: string;
  accountId: string;
  type: OrderType;
  symbol: string;
  quantity: number;
  price?: number;
  status: "open" | "filled" | "cancelled" | "rejected";
}
export interface Position {
  id: string;
  accountId: string;
  symbol: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pl: number;
}
export interface Preferences { telegram: boolean; email: boolean; threshold?: number }
export interface TradeState {
  email?: string;
  emailConsent?: boolean;
  preferences: Preferences;
  accounts: Account[];
  orders: Order[];
  positions: Position[];
  activity: string[];
  nextId: number;
}
export type Flow =
  | { kind: "link-email" }
  | { kind: "link-key"; broker: Broker }
  | { kind: "link-secret"; broker: Broker; apiKey: string }
  | { kind: "place-symbol"; type: OrderType }
  | { kind: "place-quantity"; type: OrderType; symbol: string }
  | { kind: "place-price"; symbol: string; quantity: number }
  | { kind: "modify-quantity"; orderId: string }
  | { kind: "modify-price"; orderId: string; quantity: number }
  | { kind: "threshold" };

let clock: () => number = () => Date.now();
/** Test seam for every timestamp written by trading flows. */
export function setNowForTests(fn?: () => number): void { clock = fn ?? (() => Date.now()); }
export function now(): number { return clock(); }

export function state(ctx: Ctx): TradeState {
  if (!ctx.session.trade) {
    ctx.session.trade = { preferences: { telegram: true, email: false }, accounts: [], orders: [], positions: [], activity: [], nextId: 1 };
  }
  return ctx.session.trade;
}
export function id(ctx: Ctx, prefix: string): string { const s = state(ctx); return `${prefix}-${s.nextId++}`; }
export function clearFlow(ctx: Ctx): void { ctx.session.flow = undefined; }
export function log(ctx: Ctx, message: string): void {
  const s = state(ctx); s.activity.push(`${now()}:${message}`); if (s.activity.length > 100) s.activity.shift();
}
export function account(ctx: Ctx): Account | undefined { return state(ctx).accounts[0]; }
export function escaped(value: string): string { return value.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!); }
export function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function positive(value: string): number | undefined { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : undefined; }
export function symbol(value: string): string | undefined { const s = value.trim().toUpperCase(); return /^[A-Z0-9]{2,20}$/.test(s) ? s : undefined; }
export function activeOrders(ctx: Ctx): Order[] { return state(ctx).orders.filter((o) => o.status === "open"); }

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function secretMaterial(ctx?: Ctx): string | undefined {
  const workerToken = (ctx as unknown as { env?: { BOT_TOKEN?: string } } | undefined)?.env?.BOT_TOKEN;
  return workerToken ?? (typeof process === "undefined" ? undefined : process.env.BOT_TOKEN);
}
async function key(ctx?: Ctx): Promise<CryptoKey> {
  const material = secretMaterial(ctx);
  if (!material) throw new Error("secure storage unavailable");
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function b64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function bytes(value: string): Uint8Array { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
export async function encrypt(ctx: Ctx, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(ctx), encoder.encode(value));
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}
export async function decrypt(ctx: Ctx, value: string): Promise<string> {
  const [iv, payload] = value.split(".");
  if (!iv || !payload) throw new Error("invalid encrypted credential");
  const ivBytes = bytes(iv); const payloadBytes = bytes(payload);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer }, await key(ctx), payloadBytes.buffer as ArrayBuffer);
  return decoder.decode(plain);
}

async function hmac(secret: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function binanceRequest(ctx: Ctx, account: Account, path: string, params: URLSearchParams, method: "GET" | "POST" | "DELETE"): Promise<unknown> {
  const apiKey = await decrypt(ctx, account.encryptedApiKey); const apiSecret = await decrypt(ctx, account.encryptedApiSecret);
  params.set("timestamp", String(now())); params.set("recvWindow", "5000"); params.set("signature", await hmac(apiSecret, params.toString()));
  const base = account.mode === "paper" ? "https://testnet.binance.vision" : "https://api.binance.com";
  const res = await fetch(`${base}${path}?${params.toString()}`, { method, headers: { "X-MBX-APIKEY": apiKey } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.msg === "string" ? body.msg : "Broker request failed");
  return body;
}
export async function verifyAccount(ctx: Ctx, a: Account): Promise<void> {
  if (a.platform !== "binance") throw new Error("This platform needs its secure trading gateway before it can be linked.");
  await binanceRequest(ctx, a, "/api/v3/account", new URLSearchParams(), "GET");
}
export async function executeOrder(ctx: Ctx, a: Account, order: Order): Promise<{ status: Order["status"]; price?: number }> {
  if (a.platform !== "binance") throw new Error("This platform needs its secure trading gateway before orders can be sent.");
  const p = new URLSearchParams({ symbol: order.symbol, side: "BUY", type: order.type.toUpperCase(), quantity: String(order.quantity) });
  if (order.type === "limit" && order.price) { p.set("price", String(order.price)); p.set("timeInForce", "GTC"); }
  const r = await binanceRequest(ctx, a, "/api/v3/order", p, "POST") as { status?: string; price?: string; fills?: Array<{ price: string }> };
  return { status: r.status === "FILLED" ? "filled" : "open", price: Number(r.fills?.[0]?.price ?? r.price) || undefined };
}
export async function cancelBrokerOrder(ctx: Ctx, a: Account, order: Order): Promise<void> {
  if (a.platform !== "binance") throw new Error("This platform needs its secure trading gateway before orders can be cancelled.");
  await binanceRequest(ctx, a, "/api/v3/order", new URLSearchParams({ symbol: order.symbol, origClientOrderId: order.id }), "DELETE");
}
