# Интеграция с сайтом на Laravel (опционально)

Backend умеет синхронизироваться не только с виджетом, но и с сайтом на Laravel:
отдавать список разделов и новостей, принимать правки из админки и сбрасывать кэш страниц.
Используется в демо-репозитории (`adaptive-widget-demo`, каталог `Colledge/...`).

## Что доступно

В админке появляются две вкладки для сайта:

- **Сайт** — карточки (овизиторы онлайн, диалоги виджета, новости, страницы/разделы),
  список разделов `page_sections` с онлайн-статистикой посетителей.
- **Новости** — CRUD мультиязычных новостей (RU/KK/EN), обложка, галерея, публикация, избранное.

## API для сайта

Бэкенд проксирует запросы на сайт (Laravel), передавая токен:

```
POST /api/site/webhooks/config        — имя сайта, токен, адрес
GET  /api/site/overview               — сводка: онлайн, новости, разделы
GET  /api/site/sections?search=…      — список page_sections
GET  /api/site/sections/:id           — раздел с контентом
PUT  /api/site/sections/:id           — сохранить раздел (мультиязычный content, merge)
GET  /api/site/news?page=…            — список новостей (пагинация)
POST/PUT/DELETE /api/site/news/:id    — CRUD новостей
POST /api/site/cache/clear            — сброс кэша страниц сайта
POST /api/site/online                 — beacon онлайн-посетителя
```

В Laravel-приложении с другой стороны стоит:

- `routes/api.php` — группа `/api/site/*`, защита `SiteAdminToken` middleware;
- `app/Http/Controllers/Api/SiteAdminController.php` — все эндпоинты;
- интеграция кэша страниц: после правок разделов/новостей вызывается инвалидация
  `page_cache:*` (см. `app/Http/Middleware/CacheResponse.php` в демо), поэтому изменения
  с админки сразу видны на сайте (плюс `Cache-Control: no-store` для браузера).

## Настройка связи

1. На сайте добавьте `SITE_ADMIN_TOKEN` в `.env` (совпадает с `siteToken` в `config.json`).
2. В `server/config.json` задайте `siteUrl` и `siteToken`.
3. Проверьте: `GET /api/site/overview` в админке сайта.