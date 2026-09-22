# Конфигурация виджета — полный справочник

Настройки задаются глобальным объектом `window.ADAPTIVE_WIDGET` **до** подключения скрипта:

```html
<script>
window.ADAPTIVE_WIDGET = {
  siteName: 'Мой магазин',
  backend: 'https://support.example.com/api',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-...',
  provider: 'openai',
  model: 'gpt-4o-mini'
};
</script>
<script src="/adaptive-widget.js"></script>
```

## Таблица всех опций

| Опция | Тип | По умолчанию | Описание |
|---|---|---|---|
| `siteName` | string | из `<title>` сайта | имя в шапке чата и в статистике бэкенда |
| `logo` | string | — | URL логотипа в шапке чата |
| `position` | `left`/`right` | `right` | расположение плавающей кнопки |
| `backend` | string | — | адрес сервера поддержки (`.../api`). Включает чат с ИИ-агентом, операторов, «Муху», QA, FAQ-чипы, статистику бэкенда |
| `endpoint` | string | `http://localhost:11434/v1/chat/completions` | OpenAI-совместимый URL модели. **Если без `backend`** — виджет ходит в модель напрямую |
| `apiKey` | string | — | ключ API (OpenAI/OpenRouter/Groq/Mistral...). Пусто для Ollama |
| `provider` | string | `auto` | провайдер: `auto`, `ollama`, `openai`, `openrouter`, `groq`, `mistral`, `custom` |
| `model` | string | по провайдеру | имя модели (например `qwen2.5:3b`, `gpt-4o-mini`, `openrouter/auto`) |
| `aiEnabled` | bool | `true` | отключение обращений к ИИ-модели (QA-база и операторы работают) |
| `supportEmail` | string | — | email в фразе «напишите нам» при недоступности бэкенда |
| `instructions` | string | — | инструкции, добавляемые в системный промпт |
| `askEmail` | bool/`optional` | `false` | просить email перед чатом; `optional` позволяет пропустить |
| `autoOpen` | bool | `true` | открыть панель сразу после загрузки |
| `teaser` | string | — | плашка-подсказка у кнопки до открытия (например «Спросите о доставке») |
| `aiStyle` | bool | `true` | авто-подбор цветов под стиль страницы |
| `vision` | bool | `false` | описывать картинки страницы через мультимодальную модель |
| `readImages` | bool | `true` | добавлять `img[alt]` в знания |
| `sound` | bool | `true` | звук при новом сообщении |
| `checkinAfter` | int | `180` | секунд бездействия до сообщения «Вы ещё здесь?» |
| `operatorsEnabled` | bool | `true` | кнопки «Позвать оператора»/«Вернуть ИИ» (перекрывается сервером) |
| `flyEnabled` | bool | `true` | вкладка «Муха» (перекрывается сервером) |
| `flyThreeUrl` | string | CDN three.js r128 | URL three.js для 3D-вьювера |
| `lang` | string | из `<html lang>` | принудительный язык интерфейса (`ru`/`en`) |

## Порядок применения флагов (важно)

1. Флаги из `window.ADAPTIVE_WIDGET` (значения по умолчанию — таблица выше).
2. На старте виджет делает `GET /api/flags` на `backend` (если он задан) и **перекрывает**
   `operatorsEnabled`, `flyEnabled`, `askEmail` значениями сервера.
3. `localStorage.pw_cfg` используется **только** когда сервер недоступен (офлайн-фолбэк).
4. После каждого успешного ответа сервера кэш перезаписывается актуальными значениями.

Поэтому «выключили в админке — у клиента сразу исчезло» работает из коробки.

## Внешние контролы

```js
window.AdaptiveWidget.open();      // открыть чат
window.AdaptiveWidget.close();     // закрыть
window.AdaptiveWidget.toggle();    // переключить
window.AdaptiveWidget.refresh();   // перечитать стиль и знания страницы, перекрасить
window.AdaptiveWidget.palette();   // { primary, accent, bg, dark, radius, font }
```

## Авто-подбор дизайна

По умолчанию виджет сам находит на странице основной цвет (`--primary`, ссылки, `btn`, hero)
и шрифт заголовков, после чего плавно перекрашивается (тёмная тема — по `no-js`/фоновым
свойствам). Если сайт тёмный — виджет становится тёмным; светлый — светлым.

Вручную можно:

```html
<script>
window.ADAPTIVE_WIDGET = {
  aiStyle: false,
  palette: { primary: '#2563eb', accent: '#7c3aed', bg: '#ffffff', dark: false, radius: 12, font: 'Segoe UI' }
};
</script>
```