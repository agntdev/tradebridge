# Trade Control Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that connects to users' brokerage accounts (Binance, MT4/MT5, Interactive Brokers, Coinbase Pro) to manage orders and positions. Supports live/paper trading with explicit confirmations for critical actions, and sends notifications via Telegram DMs and email to users, plus admin alerts for live trades and errors.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Retail traders
- Individual investors
- Active traders

## Success criteria

- Users can securely link and manage multiple brokerage accounts
- All live trade actions require explicit confirmation
- Notifications are delivered to users and admin for critical events

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with account linking and trading options
- **Link Account** (button, actor: user, callback: account:link) — Initiate account linking flow with broker selection and API credential entry
  - inputs: Broker platform, API key/secret, Live/paper mode
  - outputs: Linked account confirmation
- **Place Order** (button, actor: user, callback: order:place) — Select order type and parameters with confirmation for live accounts
  - inputs: Order type, Symbol, Quantity, Price
  - outputs: Order confirmation
- **Modify Order** (button, actor: user, callback: order:modify) — Choose existing order to modify with confirmation for live accounts
  - inputs: Order ID, New parameters
  - outputs: Modification confirmation
- **Cancel Order** (button, actor: user, callback: order:cancel) — Select order to cancel with confirmation for live accounts
  - inputs: Order ID
  - outputs: Cancellation confirmation
- **View Positions** (button, actor: user, callback: position:view) — Display current open positions with P&L details
  - outputs: Position summary
- **Manage Notifications** (button, actor: user, callback: notification:manage) — Configure alert preferences for trades and account activity
  - inputs: Notification channels, Alert thresholds
  - outputs: Preference confirmation

## Flows

### Onboarding
_Trigger:_ /start

1. Display welcome message
2. Request user email registration
3. Prompt for broker platform selection
4. Collect API key/secret with encryption
5. Confirm account mode (live/paper)

_Data touched:_ User, Account

### Order Placement
_Trigger:_ order:place

1. Display order type options
2. Collect trade parameters
3. Show order summary with risk warning
4. Require explicit confirmation for live orders
5. Execute and send confirmation

_Data touched:_ Order, Account

### Order Modification
_Trigger:_ order:modify

1. List active orders
2. Collect modification parameters
3. Show changes with confirmation prompt
4. Require explicit confirmation for live accounts
5. Execute and update status

_Data touched:_ Order, Account

### Order Cancellation
_Trigger:_ order:cancel

1. List active orders
2. Select order to cancel
3. Show confirmation prompt for live accounts
4. Require explicit confirmation
5. Execute and send confirmation

_Data touched:_ Order, Account

### Position Monitoring
_Trigger:_ position:view

1. Fetch current positions from selected account
2. Display size, entry price, P&L
3. Offer position management options

_Data touched:_ Position, Account

### Alert Management
_Trigger:_ notification:manage

1. Display current notification preferences
2. Offer options to enable/disable channels
3. Update user preferences

_Data touched:_ User, Notification

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user profile with contact and preference data
  - fields: telegram_id, email, notification_preferences, default_order_type
- **Account** _(retention: persistent)_ — Brokerage account connection details and mode
  - fields: platform, encrypted_api_key, encrypted_api_secret, mode, user_id
- **Order** _(retention: persistent)_ — Trade order records with execution status
  - fields: order_id, type, symbol, quantity, price, status, account_id
- **Position** _(retention: persistent)_ — Active trading positions with performance metrics
  - fields: position_id, symbol, size, entry_price, current_price, pl, account_id
- **Notification** _(retention: session)_ — Event alerts and confirmations sent to users
  - fields: event_type, timestamp, content, delivery_channels, user_id

## Integrations

- **Telegram** (required) — Bot API messaging and notifications
- **Broker APIs** (required) — Order/position execution for Binance, MT4/MT5, IB, Coinbase Pro
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View all live order confirmations in admin channel
- Receive error notifications for API failures
- Access user activity logs for dispute resolution

## Notifications

- Telegram DM for all user alerts
- Email for trade confirmations
- Admin Telegram channel for live trades and errors

## Permissions & privacy

- Encrypted storage of API credentials
- User consent required for email notifications
- No access to funds or strategy generation

## Edge cases

- Invalid API key/secret during account linking
- Failed order execution with broker API errors
- Missing email configuration when email alerts requested

## Required tests

- End-to-end order placement flow with live account confirmation
- Position monitoring updates after trade execution
- Notification delivery to both user and admin for live trades

## Assumptions

- Users will provide valid API credentials for their brokers
- Broker APIs maintain consistent endpoints for order/position management
- Email notifications can be configured later via SMTP integration
