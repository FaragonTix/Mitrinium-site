# Mitrinium

Сайт настольной ролевой игры «Митриниум» на Cloudflare Workers.

Production: <https://mitrinium.ttrpg.workers.dev>

## Что находится в репозитории

- `index.html`, `styles.css` — главная страница;
- `apps-script-source/` — исходный интерфейс редактора персонажей;
- `calculator-script-source/` — исходный интерфейс калькулятора боёв;
- `src/worker.js` — маршруты серверного API;
- `src/characters.js` — персонажи и их состояние;
- `src/calculator.js` — сохранения боёв и библиотека противников;
- `src/client/calculator-v8/` — exact deterministic core, неизменённый predictor и production bundle модели сложности Mitrinium v8;
- `src/auth.js` — вход через Google и пользовательские сессии;
- `src/admins.js` — управление администраторами;
- `src/client/admin/` — административный Dashboard;
- `src/client/login/` — страница входа;
- `src/client/viewer-autosave.js` — локальное и облачное автосохранение;
- `migrations/` — миграции базы Cloudflare D1;
- `scripts/build-editor.mjs` — сборка статических приложений в `public/`.

Папка `public/` генерируется автоматически. Не редактируйте её вручную:
изменения будут перезаписаны следующей сборкой.

## Требования

- Node.js 22;
- npm;
- аккаунт Cloudflare с доступом к Worker `mitrinium`.

## Локальная установка

```bash
npm ci
```

При необходимости скопируйте `.dev.vars.example` в `.dev.vars` и замените
тестовые значения. Настоящие секреты нельзя добавлять в Git.

## Проверка изменений

```bash
npm test
npm run build
```

Локальный сервер:

```bash
npm run dev
```

Wrangler выводит адрес локального сайта в терминале. При локальном запуске
можно задать пользователя через `DEV_USER_EMAIL` в `.dev.vars`.

## База данных

Новые изменения структуры базы оформляются отдельным SQL-файлом в
`migrations/`. Перед публикацией миграции применяются командой:

```bash
npx wrangler d1 migrations apply mitrinium --remote
```

Не изменяйте уже применённые миграции задним числом.

## Публикация

Сначала войдите в Cloudflare:

```bash
npx wrangler login
```

Секрет пользовательских сессий настраивается один раз и не хранится в Git:

```bash
npx wrangler secret put SESSION_SECRET
```

Публикация:

```bash
npm run deploy
```

Google OAuth Client ID и основной email администратора указаны в
`wrangler.jsonc`. `SESSION_SECRET` хранится только в Cloudflare.

## Порядок работы

1. Измените исходники, но не файлы в `public/`.
2. Выполните `npm test`.
3. Выполните `npm run build`.
4. Просмотрите `git status` и убедитесь, что секреты не добавлены.
5. Создайте коммит.
6. Отправьте коммит в GitHub.
7. Опубликуйте Worker командой `npm run deploy`.

GitHub Actions проверяет тесты и сборку при каждом push и pull request, но
не публикует сайт автоматически.

## Production-модель столкновений v8

Оба режима ввода калькулятора формируют одинаковые combat profiles и проходят
один pipeline: exact core → девять признаков в порядке bundle → predictor v8.
Runtime JSON загружается и кэшируется один раз; Monte-Carlo в браузере не
запускается. Порог PЗ 7+ переводит расчёт в изолированный extreme-reference
режим с видимым предупреждением.

Старая БС в ‰ сохранена только для обратной совместимости библиотеки
статблоков. Она и множители количества не входят в production prediction.
Отображаемые категории сложности находятся в отдельной конфигурации
`V8_DIFFICULTY_THRESHOLDS` в `mitrinium-v8-core.js`.
