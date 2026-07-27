import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { account, executeOrder, id, log, positive, state, symbol, type Order, type OrderType } from "../trading.js";

registerMainMenuItem({ label: "Place order", data: "order:place", order: 20 });
const composer = new Composer<Ctx>();
composer.callbackQuery("order:place", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!account(ctx)) { await ctx.reply("Link an account first, then you can place an order.", { reply_markup: inlineKeyboard([[inlineButton("Link account", "account:link")]]) }); return; }
  await ctx.reply("Choose the order type.", { reply_markup: inlineKeyboard([[inlineButton("Market", "place:market"), inlineButton("Limit", "place:limit")], [inlineButton("Back", "menu:main")]]) });
});

composer.callbackQuery(/^place:(market|limit)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "place-symbol", type: ctx.match[1] as OrderType };
  await ctx.reply("Enter the trading symbol, for example BTCUSDT.", { reply_markup: { force_reply: true, input_field_placeholder: "BTCUSDT" } });
});
composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow; if (!flow || (flow.kind !== "place-symbol" && flow.kind !== "place-quantity" && flow.kind !== "place-price")) return next(); const input = ctx.message.text.trim();
  if (flow.kind === "place-symbol") { const s = symbol(input); if (!s) { await ctx.reply("Use a symbol made of letters and numbers, such as BTCUSDT."); return; } ctx.session.flow = { kind: "place-quantity", type: flow.type, symbol: s }; await ctx.reply("Enter the quantity to buy.", { reply_markup: { force_reply: true, input_field_placeholder: "0.01" } }); return; }
  if (flow.kind === "place-quantity") { const q = positive(input); if (!q) { await ctx.reply("Enter a quantity greater than zero."); return; } if (flow.type === "market") { await summary(ctx, flow.type, flow.symbol, q); } else { ctx.session.flow = { kind: "place-price", symbol: flow.symbol, quantity: q }; await ctx.reply("Enter the limit price.", { reply_markup: { force_reply: true, input_field_placeholder: "65000" } }); } return; }
  const p = positive(input); if (!p) { await ctx.reply("Enter a price greater than zero."); return; } await summary(ctx, "limit", flow.symbol, flow.quantity, p);
});
async function summary(ctx: Ctx, type: OrderType, symbolValue: string, quantity: number, price?: number): Promise<void> {
  const a = account(ctx); if (!a) { await ctx.reply("Your linked account is no longer available. Link it again first."); return; }
  const order: Order = { id: id(ctx, "order"), accountId: a.id, type, symbol: symbolValue, quantity, price, status: "open" };
  ctx.session.flow = undefined; ctx.session.pendingOrder = order;
  const detail = `${type === "market" ? "market" : `limit at ${price}`} order: buy ${quantity} ${symbolValue}.`;
  const warning = a.mode === "live" ? " This is a live trade and can affect your funds." : " This will be sent to your paper account.";
  await ctx.reply(`Review your ${detail}${warning}`, { reply_markup: inlineKeyboard([[inlineButton("Confirm order", "place:confirm"), inlineButton("Discard", "place:discard")]]) });
}
function pending(ctx: Ctx): Order | undefined { return ctx.session.pendingOrder; }
function clearPending(ctx: Ctx): void { delete ctx.session.pendingOrder; }
composer.callbackQuery("place:discard", async (ctx) => { await ctx.answerCallbackQuery(); clearPending(ctx); await ctx.editMessageText("Order discarded."); });
composer.callbackQuery("place:confirm", async (ctx) => {
  await ctx.answerCallbackQuery(); const order = pending(ctx); const a = account(ctx);
  if (!order || !a) { await ctx.editMessageText("That order is no longer ready. Start a new order from the menu."); return; }
  try { const result = await executeOrder(ctx, a, order); order.status = result.status; state(ctx).orders.push(order); if (result.status === "filled" && result.price) state(ctx).positions.push({ id: id(ctx, "position"), accountId: a.id, symbol: order.symbol, size: order.quantity, entryPrice: result.price, currentPrice: result.price, pl: 0 }); log(ctx, `order ${order.id} ${order.status}`); clearPending(ctx); await ctx.editMessageText(`Order sent. Its current status is ${order.status}.`); }
  catch { clearPending(ctx); await ctx.editMessageText("The broker couldn't place that order. Check your account and try again."); }
});

export default composer;
