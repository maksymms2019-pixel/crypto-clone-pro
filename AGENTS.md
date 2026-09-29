<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Bot integration goes only through service_role `bot_*` RPCs keyed by `user_points.telegram_id` — keeps balance changes logged in `point_events`.
- "Прогноз дня" rounds are opened/settled server-side by `predictions-cron` (pg_cron every 5 min) — prices never come from the client.
- `markets-proxy` overlays live OKX/Binance prices onto cached CoinGecko rows when CoinGecko fails — CoinGecko free tier blocks shared servers; optional `COINGECKO_API_KEY`.
