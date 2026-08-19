// Lightweight i18n — no dependencies. Persists in localStorage and reacts to
// `lang-change` custom event so components re-render on switch.

import { useEffect, useState, useCallback } from "react";

export type Lang = "uk" | "en";

const dict = {
  uk: {
    // tabs
    "tab.dashboard": "Огляд",
    "tab.markets":   "Ринки",
    "tab.portfolio": "Портфель",
    "tab.news":      "Новини",
    "tab.more":      "Ще",
    // common
    "common.live":      "Live",
    "common.update":    "Оновити",
    "common.updating":  "Оновлюємо…",
    "common.all":       "Усе",
    "common.gainers":   "Зростають",
    "common.losers":    "Падають",
    "common.trending":  "У тренді",
    "common.search":    "Шукати монету…",
    "common.add":       "Додати",
    "common.save":      "Зберегти",
    "common.cancel":    "Скасувати",
    "common.try_again": "Спробувати ще",
    "common.sign_in":   "Увійти",
    "common.sign_out":  "Вийти",
    "common.h24":       "за 24 год",
    "common.market_cap":"Капіталізація",
    "common.volume_24": "Об'єм 24h",
    "common.dominance": "Dominance",
    "common.fg":        "Страх/Жадібність",
    "common.top_coins": "Топ монети",
    "common.see_all":   "Усі →",
    "common.heatmap":   "Heatmap",
    "common.calc":      "Калькулятор",
    "common.settings":  "Налаштування",
    // dashboard
    "dash.hello":       "Привіт 👋",
    "dash.subtitle":    "Гідний крипто-огляд",
    "dash.welcomeBack": "З поверненням",
    "dash.my_portfolio":"Мій портфель",
    "dash.open":        "Відкрити",
    "dash.signin_pnl":  "Увійди, щоб бачити P&L і equity-кривy.",
    "dash.add_trade":   "Перейди, щоб додати угоду і бачити P&L.",
    // portfolio
    "portfolio.title":     "Портфель",
    "portfolio.trade":     "Угода",
    "portfolio.first":     "Почни з першої угоди",
    "portfolio.first_hint":"Додай buy-угоду — портфоліо порахує середню ціну, поточну вартість і P&L автоматично.",
    "portfolio.total":     "Загальна вартість",
    "portfolio.invested":  "Вкладено",
    "portfolio.assets":    "Активів",
    "portfolio.last_trades":"Останні угоди",
    "portfolio.new_trade": "Нова угода",
    "portfolio.buy":       "Купив",
    "portfolio.sell":      "Продав",
    "portfolio.coin":      "Монета",
    "portfolio.amount":    "Кількість",
    "portfolio.price_usd": "Ціна USD",
    "portfolio.fee_usd":   "Комісія USD",
    "portfolio.date":      "Дата",
    "portfolio.save":      "Зберегти угоду",
    "portfolio.added":     "Угоду додано",
    "portfolio.deleted":   "Угоду видалено",
    "portfolio.err_coin":  "Обери монету",
    "portfolio.err_amount":"Невірна кількість",
    "portfolio.err_price": "Невірна ціна",
    "portfolio.err_session":"Сесія неактивна — увійди ще раз.",
    // news
    "news.title":   "Новини",
    "news.empty":   "Новин ще немає",
    "news.empty_hint":"Натисни «Оновити» — підтягнемо свіжі з джерел.",
    "news.load":    "Завантажити новини",
    "news.filter_empty":"Нічого за цим фільтром",
    "news.filter_empty_hint":"Спробуй інший таг або «Усе».",
    "news.updated": "Оновлено",
    "news.failed":  "Не вдалось оновити",
    // settings
    "settings.title":       "Налаштування",
    "settings.accent":      "Акцент",
    "settings.accent_hint": "Колір акцентних кнопок і підсвітки.",
    "settings.lang":        "Мова",
    "settings.telegram":    "Telegram",
    "settings.tg_in":       "Привʼязано",
    "settings.tg_out":      "Відкрий додаток через бот @cryptotimetg_bot",
    "settings.delete":      "Видалити дані",
    "settings.saved":       "Збережено",
    // accent labels
    "accent.gold":   "Золотий",
    "accent.cyan":   "Бірюзовий",
    "accent.accent": "Мʼятний",
    "accent.ocean":  "Океан",
  },
  en: {
    "tab.dashboard": "Overview",
    "tab.markets":   "Markets",
    "tab.portfolio": "Portfolio",
    "tab.news":      "News",
    "tab.more":      "More",
    "common.live":      "Live",
    "common.update":    "Refresh",
    "common.updating":  "Refreshing…",
    "common.all":       "All",
    "common.gainers":   "Gainers",
    "common.losers":    "Losers",
    "common.trending":  "Trending",
    "common.search":    "Search a coin…",
    "common.add":       "Add",
    "common.save":      "Save",
    "common.cancel":    "Cancel",
    "common.try_again": "Try again",
    "common.sign_in":   "Sign in",
    "common.sign_out":  "Sign out",
    "common.h24":       "24h",
    "common.market_cap":"Market Cap",
    "common.volume_24": "Volume 24h",
    "common.dominance": "Dominance",
    "common.fg":        "Fear & Greed",
    "common.top_coins": "Top coins",
    "common.see_all":   "View all →",
    "common.heatmap":   "Heatmap",
    "common.calc":      "Calculator",
    "common.settings":  "Settings",
    "dash.hello":       "Hi 👋",
    "dash.subtitle":    "A worthy crypto overview",
    "dash.welcomeBack": "Welcome back",
    "dash.my_portfolio":"My portfolio",
    "dash.open":        "Open",
    "dash.signin_pnl":  "Sign in to track P&L and equity.",
    "dash.add_trade":   "Tap to add a trade and see P&L.",
    "portfolio.title":     "Portfolio",
    "portfolio.trade":     "Trade",
    "portfolio.first":     "Start with your first trade",
    "portfolio.first_hint":"Add a buy — we'll compute average cost, current value and P&L automatically.",
    "portfolio.total":     "Total value",
    "portfolio.invested":  "Invested",
    "portfolio.assets":    "Assets",
    "portfolio.last_trades":"Latest trades",
    "portfolio.new_trade": "New trade",
    "portfolio.buy":       "Buy",
    "portfolio.sell":      "Sell",
    "portfolio.coin":      "Coin",
    "portfolio.amount":    "Amount",
    "portfolio.price_usd": "Price USD",
    "portfolio.fee_usd":   "Fee USD",
    "portfolio.date":      "Date",
    "portfolio.save":      "Save trade",
    "portfolio.added":     "Trade added",
    "portfolio.deleted":   "Trade deleted",
    "portfolio.err_coin":  "Pick a coin",
    "portfolio.err_amount":"Invalid amount",
    "portfolio.err_price": "Invalid price",
    "portfolio.err_session":"Session inactive — please sign in again.",
    "news.title":   "News",
    "news.empty":   "No news yet",
    "news.empty_hint":"Tap Refresh to pull fresh stories.",
    "news.load":    "Load news",
    "news.filter_empty":"Nothing for this filter",
    "news.filter_empty_hint":"Try another tag or All.",
    "news.updated": "Updated",
    "news.failed":  "Failed to refresh",
    "settings.title":       "Settings",
    "settings.accent":      "Accent",
    "settings.accent_hint": "Color of primary CTAs and highlights.",
    "settings.lang":        "Language",
    "settings.telegram":    "Telegram",
    "settings.tg_in":       "Linked",
    "settings.tg_out":      "Open the app via @cryptotimetg_bot",
    "settings.delete":      "Delete data",
    "settings.saved":       "Saved",
    "accent.gold":   "Gold",
    "accent.cyan":   "Cyan",
    "accent.accent": "Mint",
    "accent.ocean":  "Ocean",
  },
} as const;

export type TKey = keyof (typeof dict)["uk"];

const STORAGE_KEY = "ct.lang";
const EVENT = "lang-change";

export function getLang(): Lang {
  if (typeof window === "undefined") return "uk";
  const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored === "uk" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "uk";
}

export function setLang(lang: Lang) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: lang }));
}

export function t(key: TKey, lang: Lang = getLang()): string {
  return (dict[lang] as Record<string, string>)[key] ?? (dict.uk as Record<string, string>)[key] ?? key;
}

export function useT() {
  const [lang, setLangState] = useState<Lang>(() => getLang());
  useEffect(() => {
    const onChange = (e: Event) => setLangState((e as CustomEvent).detail as Lang);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  const translate = useCallback((k: TKey) => t(k, lang), [lang]);
  return { t: translate, lang, setLang };
}
