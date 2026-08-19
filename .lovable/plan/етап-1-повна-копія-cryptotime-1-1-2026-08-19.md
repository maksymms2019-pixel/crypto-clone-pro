# Етап 1 — повна копія CryptoTime 1:1

Мета: цей проєкт стає точною копією репозиторію `maksymms2019-pixel/cryptoclone-enhancements` (фронтенд + бекенд), підключеною до вашого власного Supabase, без прив'язок до Lovable. Правки з другого списку робимо окремо, після вашого підтвердження, що копія працює.

## Що переноситься

- Увесь фронтенд: `index.html`, `src/` (сторінки Dashboard, Markets, Portfolio, News, Calc, Settings, CoinDetail, Heatmap, Assistant, Auth, ResetPassword; усі компоненти, включно з CryptoBubbles, HeatMap, PriceChart; бібліотеки `lib/` — ai, auth, news, markets, telegram, i18n, icons, metrics).
- PWA: `public/manifest.webmanifest`, іконки, service worker через vite-plugin-pwa.
- Бекенд: `supabase/migrations/*` (21 міграція) та 5 edge-функцій — `ai-assistant`, `news-aggregator`, `markets-proxy`, `market-metrics`, `tg-auth`.
- Конфіги: `vite.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.js`, `package.json` з тим самим набором залежностей, `DEPLOY.md`.

Поточний порожній шаблон проєкту (TanStack-роутинг: `src/routes/`, `src/router.tsx`, `src/server.ts`, `src/start.ts`, `routeTree.gen.ts`) видаляється — копія працює на React Router + Vite SPA, як в оригіналі.

## Ключі та підключення

Після початку роботи я запрошу у вас через захищену форму:

- `VITE_SUPABASE_URL` і `VITE_SUPABASE_PUBLISHABLE_KEY` — нового Supabase-проєкту (фронтенд);
- `SUPABASE_ACCESS_TOKEN` + project ref (і пароль БД, якщо знадобиться звірка міграцій) — щоб я сам задеплоїв edge-функції і звірив схему;
- `GEMINI_API_KEY` — для AI-асистента (виклик Google Generative Language API напряму);
- `TELEGRAM_BOT_TOKEN` — для `tg-auth` (автовхід у Telegram Mini App).

Ключі Gemini і Telegram кладу в секрети Edge Functions вашого Supabase, не в код.

## Бекенд-кроки

Схема у вас уже перенесена, тому:

1. Звіряю наявні таблиці/політики з міграціями репозиторію і донакочую лише те, чого бракує.
2. Деплою всі 5 edge-функцій у ваш проєкт (`supabase functions deploy`) з вимкненою перевіркою JWT там, де так було в оригіналі.
3. Прописую секрети функцій.
4. Перевіряю кожну функцію живим викликом: новини, ринки, метрики, AI-чат, tg-auth.

## Перевірка

- Локальний білд і запуск, прохід по всіх сторінках у мобільному вигляді.
- Порівняння з https://cryptotime-iota.vercel.app/news — верстка, дані, поведінка.
- Перевірка PWA-маніфесту та реєстрації service worker.
- Звіт: що працює, і якщо щось падає — чому саме (ключ, схема чи код).

## Технічні деталі

- Vite SPA, порт 8080, alias `@ -> ./src`, вихід у `dist/`.
- Supabase-клієнт лишається як в оригіналі (`src/integrations/supabase/client.ts`) з підтримкою нових `sb_publishable_` ключів.
- `supabase/config.toml` оновлюється на новий `project_id`.
- Google-логін працює через стандартний `supabase.auth.signInWithOAuth` — вам треба буде увімкнути Google-провайдера у вашому Supabase (я дам точні кроки).

## Етап 2 (після підтвердження копії)

Не робиться зараз, зафіксовано як наступний крок: полагодити AI-асистент, повністю прибрати переклад новин, почистити експорт картинки Crypto Bubbles (зміщений текст + водяний знак «cryptotime.app»), красиве ім'я замість `tg_...@cryptotime.local`, іконки в HeatMap і Crypto Bubbles усередині Telegram.
