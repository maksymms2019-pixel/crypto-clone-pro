# Bot API (CryptoTime)

Бот підключається до Supabase з **service_role** ключем (тримати тільки на сервері бота).

```js
import { createClient } from "@supabase/supabase-js";
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

await sb.rpc("bot_get_user",      { tg_id: ctx.from.id });                       // баланс, рівень, rank, coin_id, tickets...
await sb.rpc("bot_award_points",  { tg_id: ctx.from.id, amount: 50, reason: "channel_sub" });
await sb.rpc("bot_deduct_points", { tg_id: ctx.from.id, amount: 20, reason: "shop" });  // не йде в мінус
await sb.rpc("bot_set_points",    { tg_id: ctx.from.id, balance: 500, reason: "manual_fix" });
```

Усі функції повертають `{ ok: true, balance }` або `{ ok: false, error: "user_not_found" | "bad_amount" | "insufficient_balance" }`.
Кожна зміна пишеться в `point_events` з reason `bot:<reason>`. Також у `user_points` є колонка `telegram_id` для прямих SELECT.
