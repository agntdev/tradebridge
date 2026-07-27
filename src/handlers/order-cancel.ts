import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { account, activeOrders, cancelBrokerOrder, state } from "../trading.js";
registerMainMenuItem({ label: "Cancel order", data: "order:cancel", order: 40 });
const composer = new Composer<Ctx>();
composer.callbackQuery("order:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  const orders = activeOrders(ctx); if (!orders.length) { await ctx.reply("No active orders to cancel."); return; }
  await ctx.reply("Choose the order to cancel.", { reply_markup: inlineKeyboard(orders.slice(0, 6).map((o) => [inlineButton(`${o.symbol} ${o.quantity}`, `cancel:${o.id}`)])) });
});
composer.callbackQuery(/^cancel:(order-\d+(?:-r)?)$/, async (ctx) => { await ctx.answerCallbackQuery(); const o = activeOrders(ctx).find((x) => x.id === ctx.match[1]); if (!o) { await ctx.editMessageText("That order is no longer active."); return; } ctx.session.pendingModify = { id: o.id, quantity: 0, price: 0 }; const a = account(ctx); await ctx.editMessageText(a?.mode === "live" ? `Cancel ${o.symbol}? This live action can't be undone.` : `Cancel ${o.symbol} in your paper account?`, { reply_markup: inlineKeyboard([[inlineButton("Confirm cancellation", "cancel:confirm"), inlineButton("Keep order", "cancel:discard")]]) }); });
composer.callbackQuery(/^cancel:(confirm|discard)$/, async (ctx) => { await ctx.answerCallbackQuery(); const pending = ctx.session.pendingModify; delete ctx.session.pendingModify; if (!pending || ctx.match[1] === "discard") { await ctx.editMessageText(pending ? "Order kept." : "That cancellation is no longer ready."); return; } const o = state(ctx).orders.find((x) => x.id === pending.id); const a = account(ctx); if (!o || !a) { await ctx.editMessageText("That order is no longer active."); return; } try { await cancelBrokerOrder(ctx, a, o); o.status = "cancelled"; await ctx.editMessageText("Order cancelled."); } catch { await ctx.editMessageText("The broker couldn't cancel that order. Check its current status and try again."); } });

export default composer;
