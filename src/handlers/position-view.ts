import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { account, state } from "../trading.js";
registerMainMenuItem({ label: "View positions", data: "position:view", order: 50 });
const composer = new Composer<Ctx>();
composer.callbackQuery("position:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const a = account(ctx); if (!a) { await ctx.reply("No account is linked yet — link one to view positions.", { reply_markup: inlineKeyboard([[inlineButton("Link account", "account:link")]]) }); return; }
  const positions = state(ctx).positions.filter((p) => p.accountId === a.id && p.size !== 0);
  if (!positions.length) { await ctx.reply("No open positions yet — place an order when you're ready.", { reply_markup: inlineKeyboard([[inlineButton("Place order", "order:place")]]) }); return; }
  const lines = positions.map((p) => `${p.symbol}: ${p.size} at ${p.entryPrice} · P&L ${p.pl.toFixed(2)}`);
  await ctx.reply(`Open positions\n${lines.join("\n")}`, { reply_markup: inlineKeyboard([[inlineButton("Place order", "order:place"), inlineButton("Back", "menu:main")]]) });
});

export default composer;
