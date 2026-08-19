# Деплой CryptoTime — 2 кліки

Проєкт — це **звичайний Vite SPA**. Білд видає статичну папку `dist/`, яку приймає будь-який статичний хостинг без серверних функцій і без додаткових конфігів.

## Vercel

1. **Import Git Repository** на [vercel.com/new](https://vercel.com/new) → обери цей репозиторій.
2. Vercel автоматично визначить **Framework Preset: Vite**.
3. Натисни **Deploy**. Все.

Перевір що автоматично підставилось:
- Build Command: `vite build` (або `npm run build`)
- Output Directory: `dist`

Жодного `vercel.json` не треба. Жодних env vars для базового функціоналу.

## Netlify (drag-and-drop)

1. Локально: `npm install && npm run build`.
2. Перетягни папку `dist/` на [app.netlify.com/drop](https://app.netlify.com/drop). Готово.

Або через Git: Build command `npm run build`, Publish directory `dist`.

## Бекенд — стандартний Supabase (self-host або керований)

Бекенд — **звичайний Supabase**, повністю незалежний від Lovable. Це база даних + авторизація + edge-функції. Фронт ходить у нього за двома змінними з `.env`:

```
VITE_SUPABASE_URL=https://<твій-проєкт>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
```

Коли деплоїш на Vercel/Netlify — додай ці дві змінні в **Environment Variables** проєкту.

### Перенесення на власний Supabase

1. Створи проєкт на [supabase.com](https://supabase.com) (або підніми self-hosted Supabase).
2. Прогони міграції з `supabase/migrations` (`supabase db push` через Supabase CLI).
3. Задеплой edge-функції з `supabase/functions` (`supabase functions deploy`).
4. Перенеси дані (`pg_dump`/`pg_restore` або експорт-імпорт таблиць).
5. Онови `VITE_SUPABASE_URL` та `VITE_SUPABASE_PUBLISHABLE_KEY` у фронті.

### Секрети edge-функцій (Supabase → Project Settings → Edge Functions → Secrets)

| Секрет | Для чого |
| --- | --- |
| `GEMINI_API_KEY` | AI-чат напряму через Google Gemini (`gemini-2.5-flash`). Незалежний від Lovable. |
| `TELEGRAM_BOT_TOKEN` | Перевірка Telegram Mini-App входу (`tg-auth`). |

AI-чат більше **не** залежить від Lovable AI Gateway — він викликає офіційний Google Generative Language API напряму з твоїм ключем.

### Авторизація Google

Вхід через Google використовує стандартний Supabase OAuth (`supabase.auth.signInWithOAuth`). Увімкни Google-провайдера у Supabase Auth → Providers і додай свої Client ID/Secret та callback-URL.

## Telegram Mini App

1. Відкрий [@BotFather](https://t.me/BotFather) → `/newbot`.
2. `/newapp` → встав URL свого деплою (наприклад `https://cryptotime.vercel.app`).
3. Готово — бот віддасть `t.me/<bot>/<app>`.

Telegram WebApp SDK уже підключений в `index.html`, тема адаптується автоматично.
