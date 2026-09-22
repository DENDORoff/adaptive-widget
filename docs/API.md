# Backend API — справочник

Сервер: `node server/server.js` (порт `3000` по умолчанию, меняется через `PORT`).

Ответы — JSON. CORS открыт для любых сайтов. Админ-эндпоинты требуют заголовок
`x-admin-token` (токен из `config.json → adminToken`; пустой токен — доступ без пароля).

## Публичные (для виджета)

### `GET /api/flags`
Возвращает флаги, которыми сервер управляет виджетом:

```json
{ "ok": true, "operatorsEnabled": false, "flyEnabled": false, "askEmail": false, "aiEnabled": true }
```

### `POST /api/init`
Регистрирует/обновляет «чат» (диалог посетителя). Виджет присылает:
`siteName`, `page`, `knowledge[]`, `prompt`, `instructions`.
Ответ: `{ ok, chatId, operatorsEnabled, flyEnabled, askEmail, aiEnabled }`.

### `POST /api/chat/:id/message`
`{ text, email?, page }` → агент отвечает (`from`: `ai`/`operator`/`system`).
Ответ включает `text` и (опционально) `qa` источник.

### `POST /api/chat/:id/handoff`
Запрос «позвать оператора». Если `operatorsEnabled=false` → `400 { error: 'operators_disabled' }`.
Статус чата становится `human`; оператору уходит уведомление (email/Discord).

### `POST /api/chat/:id/events` (SSE)
Поток событий: новые сообщения, статусы. Виджет подписывается для мгновенных обновлений.

### `POST /api/chat/:id/rating`
`{ score: 1..5 }` — оценка диалога (уходит в Discord).

### `GET /api/faq`
Популярные вопросы из `qa[]` — виджет рисует чипы-подсказки.

### `GET /api/fly/status`, `GET /api/fly/neurons`, `POST /api/fly/chat`, `GET /api/fly/neuron/:id`
«Муха»: статус NeuPrint, список демо-нейронов, вопросы по коннектому, 3D-данные нейрона.
Всё кромé `status` отвечает `400 { error: 'fly_disabled' }` при `flyEnabled=false`.

### `GET /api/config`
Публичное подмножество конфигурации (флаги, `qa`, `siteName`) — без токена.

## Админские (с `x-admin-token`)

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/api/chats` | список чатов (последние сверху) |
| GET | `/api/chat/:id` | детали чата: сообщения, инструкции, промпт, знания |
| POST | `/api/chat/:id/refresh` | обновить данные чата, пометить прочитанным |
| POST | `/api/chat/:id/ai` | вернуть чат ИИ-агенту (оператор → ИИ) |
| POST | `/api/chat/:id/resolve` | пометить решённым |
| POST | `/api/chat/:id/close` | закрыть тикет |
| POST | `/api/chat/:id/reply` | ответ оператора (уходит в SSE + email при офлайне) |
| POST | `/api/chat/:id/instructions` | сохранить инструкции для агента в этом чате и в базу знаний |
| GET | `/api/stats` | скользящая статистика: активные, чаты, ответы, нерешённые, оценки, популярные запросы |
| GET/POST/DELETE | `/api/kb[/:id]` | база инструкций (глобальные знания агента) |
| PUT | `/api/config` | сохранить настройки (провайдер, модель, флаги, SMTP, Discord, QA, инструкции…) |
| POST | `/api/mail/test` | `{ to }` — тестовое письмо |
| GET | `/api/fly/config` | диагностика «Мухи» (NeuPrint API, офлайн-справочник) |

## Конфигурация сервера (`config.json`)

| Ключ | По умолчанию | Описание |
|---|---|---|
| `provider`, `endpoint`, `model`, `apiKey` | ollama / localhost / qwen2.5:3b | ИИ-модель |
| `from` | `support@...` | отправитель email-уведомлений |
| `adminToken` | — | пароль админки (пусто — без пароля) |
| `instructions` | — | глобальные инструкции агента |
| `askEmail` | `false` | «спрашивать email перед чатом» |
| `qa[]` | `[]` | вопрос-ответ (`q`, `a`, `keys[]`), работает без ИИ |
| `qaThreshold` | `0.45` | порог схожести для QA-совпадения |
| `agentMode` | `rag` | `rag` — весь контекст сразу, `tools` — агент с tool-calling |
| `operatorsEnabled` | `true` | операторы |
| `flyEnabled` | `true` | «Муха» |
| `flyBase` | `https://neuprint.janelia.org` | NeuPrint API |
| `smtp` | `null` | SMTP-уведомления (демо без него пишет в `data/email.log.ndjson`) |
| `discordWebhook`… | — | Discord-уведомления |
| `ticketTtlDays` | `14` | автозачистка старых тикетов (0 — выкл) |
| `siteUrl`, `siteToken` | — | связка с Laravel-сайтом (`/api/site/*`) |

## Хранение данных

- `server/data/chats.json` — чаты и сообщения
- `server/data/kb.json` — база инструкций
- `server/data/email.log.ndjson` — outbox писем (демо-режим)
- `server/config.json` — настройки

Папка `data/` создаётся автоматически и не попадает в git (добавлена в `.gitignore`).