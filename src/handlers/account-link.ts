import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { encrypt, id, log, state, validEmail, verifyAccount, type Broker, type Mode } from "../trading.js";

registerMainMenuItem({ label: "Link account", data: "account:link", order: 10 });
const composer = new Composer<Ctx>();
const brokers = inlineKeyboard([[inlineButton("Binance", "link:binance"), inlineButton("MT4 / MT5", "link:mt4mt5")], [inlineButton("Interactive Brokers", "link:ib"), inlineButton("Coinbase", "link:coinbase")], [inlineButton("Back", "menu:main")]]);

composer.callbackQuery("account:link", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.flow = { kind: "link-email" };
  await ctx.reply("Enter the email address for trade confirmations.", { reply_markup: { force_reply: true, input_field_placeholder: "you@example.com" } });
});

composer.on("message:text", async (ctx, next) => {
  const flow = ctx.session.flow;
  if (!flow || (flow.kind !== "link-email" && flow.kind !== "link-key" && flow.kind !== "link-secret")) return next();
  const input = ctx.message.text.trim();
  if (flow.kind === "link-email") {
    if (!validEmail(input)) { await ctx.reply("Enter a valid email address to continue."); return; }
    state(ctx).email = input;
    await ctx.reply("May we use this email for trade confirmations?", { reply_markup: inlineKeyboard([[inlineButton("Allow email alerts", "link:email:yes"), inlineButton("Telegram only", "link:email:no")]]) });
    return;
  }
  if (flow.kind === "link-key") {
    if (input.length < 8) { await ctx.reply("That API key looks too short. Check it and try again."); return; }
    ctx.session.flow = { kind: "link-secret", broker: flow.broker, apiKey: input };
    await ctx.reply("Now enter the API secret. It will be encrypted before it is saved.", { reply_markup: { force_reply: true, input_field_placeholder: "API secret" } });
    return;
  }
  if (input.length < 8) { await ctx.reply("That API secret looks too short. Check it and try again."); return; }
  const encryptedApiKey = await encrypt(ctx, flow.apiKey).catch(() => undefined);
  const encryptedApiSecret = await encrypt(ctx, input).catch(() => undefined);
  if (!encryptedApiKey || !encryptedApiSecret) { await ctx.reply("Secure credential storage isn't set up yet. Try again later."); return; }
  ctx.session.flow = undefined;
  ctx.session.trade!.accounts.push({ id: id(ctx, "account"), platform: flow.broker, mode: "paper", encryptedApiKey, encryptedApiSecret });
  const a = ctx.session.trade!.accounts.at(-1)!;
  await ctx.reply("Choose how this account will trade.", { reply_markup: inlineKeyboard([[inlineButton("Paper trading", `linkmode:${a.id}:paper`), inlineButton("Live trading", `linkmode:${a.id}:live`)]]) });
});

composer.callbackQuery(/^link:email:(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  state(ctx).emailConsent = ctx.match[1] === "yes";
  await ctx.editMessageText("Choose the brokerage platform to link.", { reply_markup: brokers });
});

composer.callbackQuery(/^link:(binance|mt4mt5|ib|coinbase)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const broker = ctx.match[1] as Broker;
  ctx.session.flow = { kind: "link-key", broker };
  await ctx.reply("Enter the API key for this account.", { reply_markup: { force_reply: true, input_field_placeholder: "API key" } });
});

composer.callbackQuery(/^linkmode:(account-\d+):(paper|live)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const a = state(ctx).accounts.find((x) => x.id === ctx.match[1]);
  if (!a) { await ctx.editMessageText("That account is no longer available. Start linking again."); return; }
  a.mode = ctx.match[2] as Mode;
  try { await verifyAccount(ctx, a); }
  catch { state(ctx).accounts = state(ctx).accounts.filter((x) => x.id !== a.id); await ctx.editMessageText("We couldn't verify those credentials. Check them and link the account again.", { reply_markup: inlineKeyboard([[inlineButton("Link account", "account:link")]]) }); return; }
  log(ctx, `linked ${a.platform} ${a.mode}`);
  await ctx.editMessageText(`${a.platform === "binance" ? "Binance" : "Your brokerage"} account linked for ${a.mode} trading.`, { reply_markup: inlineKeyboard([[inlineButton("Place order", "order:place"), inlineButton("Back to menu", "menu:main")]]) });
});

export default composer;
