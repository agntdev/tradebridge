import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { positive, state } from "../trading.js";
registerMainMenuItem({ label: "Notifications", data: "notification:manage", order: 60 });
const composer = new Composer<Ctx>();
function menu(ctx: Ctx) { const p = state(ctx).preferences; return inlineKeyboard([[inlineButton(`Telegram ${p.telegram ? "on" : "off"}`, "notify:telegram"), inlineButton("Email delivery", "notify:email")], [inlineButton("Set alert threshold", "notify:threshold"), inlineButton("Activity log", "notify:activity")], [inlineButton("Back", "menu:main")]]); }
composer.callbackQuery("notification:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = state(ctx).preferences; const threshold = p.threshold ? ` Alert threshold: ${p.threshold}.` : " No alert threshold set.";
  await ctx.reply(`Telegram alerts are ${p.telegram ? "on" : "off"}. Email alerts are ${p.email ? "on" : "off"}.${threshold}`, { reply_markup: menu(ctx) });
});
composer.callbackQuery(/^notify:(telegram|email)$/, async (ctx) => { await ctx.answerCallbackQuery(); const p = state(ctx).preferences; const key = ctx.match[1] as "telegram" | "email"; if (key === "email") { await ctx.editMessageText("Email delivery isn't set up yet. Telegram alerts will still reach you here.", { reply_markup: menu(ctx) }); return; } p.telegram = !p.telegram; await ctx.editMessageText(`Telegram alerts are now ${p.telegram ? "on" : "off"}.`, { reply_markup: menu(ctx) }); });
composer.callbackQuery("notify:activity", async (ctx) => { await ctx.answerCallbackQuery(); const items = state(ctx).activity.slice(-10); await ctx.editMessageText(items.length ? `Recent account activity\n${items.map((x) => x.slice(x.indexOf(":") + 1)).join("\n")}` : "No account activity yet.", { reply_markup: menu(ctx) }); });
composer.callbackQuery("notify:threshold", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { kind: "threshold" }; await ctx.reply("Enter the P&L amount that should trigger an alert.", { reply_markup: { force_reply: true, input_field_placeholder: "100" } }); });
composer.on("message:text", async (ctx, next) => { if (ctx.session.flow?.kind !== "threshold") return next(); const n = positive(ctx.message.text.trim()); if (!n) { await ctx.reply("Enter an alert threshold greater than zero."); return; } ctx.session.flow = undefined; state(ctx).preferences.threshold = n; await ctx.reply(`Alerts will trigger at a P&L change of ${n}.`, { reply_markup: menu(ctx) }); });

export default composer;
