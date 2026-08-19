# Crypto Clone Pro

Привіт, мені потрібно створити повну копію цього додатку, коли я кажу повну я маю на увазі повну. Фронтенд, бекенд і взагалі все 1 в 1. Єдине що API ключі для SUPABASE та Gemini AI я тобі дам нові тобі треба тільки їх запросити.

Посилання на сайт: https://cryptotime-iota.vercel.app/news



Посилання на відкритий репозиторій GitHub: https://github.com/maksymms2019-pixel/cryptoclone-enhancements

Коли ти виконаєш це то наступним етапом в нас є певні правки, які теж обовʼязково треба виконати але тільки після повної копії. Ось вони:



Після завтра ми запускаємо повністю наш додаток. Він буде в форматі сайту (який рекомендується додати на головний екран і тоді це все перетворюється на PWA) і в форматі телеграм боту і якщо в форматі сайту все вже майже готово то в форматі телеграм боту це ще не так. Йдем по порядку:
Те що треба виправити взагалі:
1. Не працює AI, можливо застарів токен Gemini, я тобі надішлю новий але ти мусиш все виправити якщо проблема на твоїй стороні, все має працювати бездоганно. Якщо проблема тільки в API ключі тоді супер, якщо проблема в коді, тоді працюй. (Фото 1)
2. Переклад новин, ми так і не добилися нормального перекладу, а тому єдине що залишається це прибрати його повністю, зроби це.
3. Маленька дрібничка але коли скачую картинку Crypto Bubbles то трошки вона не ідеальна, трохи текст зміщений деякий та знизу пише «cryptotime.app» в нас немає домену app, а тому прибери це. (Фото 2)
Те що стосується тільки телеграм версії:
В загальному вже добре що сайт сам розрізняє це і якщо це сайт то треба увійти чи зареєструватися а якщо це в телеграмі то воно автоматично це робить але:
1. Воно авторизує автоматично але підписує якось не дуже, я про це: «tg_822682324@cryptotime.local», хоч його і можна змінити, але чому зразу не взяти нікнейм чи імʼя, щоб виглядало чистіше? (Фото 3)
2. Чомусь в HeatMap та Crypto Bubbles не прогружаються іконки. Не зрозуміло чому бо в звичайному сайті все добре, це треба виправити. (Фото 4 та 5)
Якщо потрібно оновити будь які api ключі, запитуй я тобі їх надішлю, щоб все точно працювало як треба, БЕЗ привʼязок до Lovable.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f715c31e-77b4-4f5b-8188-1c3309765a15).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
