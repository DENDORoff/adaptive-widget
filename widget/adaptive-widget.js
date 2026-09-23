(function () {
  'use strict';

  var DEFAULTS = {
    siteName: '',
    logo: '',
    position: 'right',
    apiKey: '',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: '',
    provider: 'auto',
    aiEnabled: true,
    backend: '',
    askEmail: false,
    supportEmail: 'support@deworld.su',
    instructions: '',
    autoOpen: true,
    teaser: '',
    aiStyle: true,
    readImages: true,
    vision: false,
    sound: true,
    checkinAfter: 180,
    operatorsEnabled: true,
    flyEnabled: true,
    flyThreeUrl: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
  };

  var CUSTOM = window.ADAPTIVE_WIDGET || {};
  var CONFIG = {};
  var k;
  for (k in DEFAULTS) {
    if (DEFAULTS.hasOwnProperty(k)) {
      CONFIG[k] = CUSTOM[k] !== undefined ? CUSTOM[k] : DEFAULTS[k];
    }
  }
  if (!CONFIG.siteName) {
    CONFIG.siteName = (document.title || '').split(/[|—–]/)[0].trim() || 'Сайт';
  }
  if (!CONFIG.backend && CONFIG.endpoint && /\/api(\/|$)/.test((CONFIG.endpoint.trim() || ''))) {
    CONFIG.backend = CONFIG.endpoint.trim();
  }

  var DEFAULT_ENDPOINT = DEFAULTS.endpoint;
  var PROVIDERS = {
    ollama:     { label: 'Ollama',        base: 'http://localhost:11434/v1', model: 'qwen2.5:3b' },
    openai:     { label: 'OpenAI',        base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    openrouter: { label: 'OpenRouter',    base: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
    groq:       { label: 'Groq',          base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    mistral:    { label: 'Mistral',       base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
    custom:     { label: 'Свой API',      base: '' }
  };
  var BACKEND = { provider: 'custom', label: 'Свой API', endpoint: CONFIG.endpoint, model: CONFIG.model || 'gpt-4o-mini' };

  function resolveBackend() {
    var prov = CONFIG.provider;
    if (!PROVIDERS[prov]) prov = 'auto';
    if (prov === 'auto') {
      if (CONFIG.endpoint && CONFIG.endpoint !== DEFAULT_ENDPOINT) prov = 'custom';
      else prov = CONFIG.apiKey ? 'openai' : 'ollama';
    }
    var p = PROVIDERS[prov];
    BACKEND.provider = prov;
    BACKEND.label = p.label;
    if (prov === 'custom') {
      BACKEND.endpoint = CONFIG.endpoint;
      BACKEND.model = CONFIG.model || 'custom-model';
    } else {
      BACKEND.endpoint = p.base + '/chat/completions';
      BACKEND.model = CONFIG.model || p.model;
    }
  }
  resolveBackend();

  var LS = {
    get: function (k) { try { return window.localStorage ? localStorage.getItem(k) : null; } catch (e) { return null; } },
    set: function (k, v) { try { if (window.localStorage) localStorage.setItem(k, v); } catch (e) {} }
  };
  var CHAT = { id: '', email: '', human: false, seen: {}, es: null, backendTurns: 0, rated: false, closing: false, unread: 0, userTurns: 0, checkinDone: false, checkinPending: false, closed: false, checkinT: null };
  (function initChat() {
    if (!CONFIG.backend) return;
    if (CUSTOM.askEmail === undefined) CONFIG.askEmail = 'optional';
    var key = 'pw_chatid|' + (location.hostname || '');
    CHAT.id = LS.get(key) || '';
    if (!CHAT.id) { CHAT.id = 'c_' + Math.random().toString(36).slice(2, 10); LS.set(key, CHAT.id); }
    CHAT.email = LS.get('pw_email') || '';
  })();

  var LANG = (document.documentElement.lang || 'ru').slice(0, 2).toLowerCase();
  if (CONFIG.lang && CONFIG.lang.length === 2) LANG = CONFIG.lang;
  var I18N_EN = LANG === 'en';
  var T = I18N_EN ? {
    title: 'Site assistant',
    status: 'answers with real site data',
    input: 'Ask about products, delivery, returns...',
    send: 'Send',
    fallback: 'I could not find an exact answer on this page. Please clarify your question or contact us directly.',
    chips: 'Popular questions',
    source: 'Source',
    close: 'Close',
    preview: 'Hi! I am an AI agent for this site. Try asking about products, delivery or returns.',
    operator: 'Operator',
    handoff: 'I am connecting you to a support operator. They will reply here or to your email.',
    operatorWait: 'Message sent to the operator. They will reply here or to your email.',
    offlineOperator: 'Please contact support: ',
    emailAsk: 'Leave your email so we can reply even if you close this tab:',
    emailSkip: 'OK, let us continue without email — answers will appear right here.',
    emailDone: 'Thanks! Now answers can also be sent to your email.',
    emailBad: 'That does not look like an email. Please enter it again:',
    ratingAsk: 'Rate how the agent answered:',
    ratingDone: 'Thank you for your rating!',
    operatorBtn: 'Call an operator',
    backBtn: 'Back to AI',
    operatorsOff: 'Operators are currently off — the AI agent answers all questions. Please clarify your question and I will keep helping.',
    checkinAsk: 'Is your question resolved?',
    checkinYes: 'Yes, resolved',
    checkinNo: 'No, I need help',
    checkinNoMsg: 'No problem — clarify your question, or I can connect an operator.',
    continueBtn: 'Continue with AI',
    checkinThanks: 'Great! Thanks. I will be here if you need anything else.',
    resumeMsg: 'Back to the AI agent — I can answer new questions right away.',
    resolveClose: 'The ticket is closed. Thanks for reaching out!',
    tabChat: 'Chat',
    tabFly: 'Fly · connectome',
    flyGreeting: 'Hi! I am a chat about the digitized brain of the fruit fly (Drosophila melanogaster) — the connectome. Ask how many neurons it has, about synapses, Kenyon cells, MBON, or tools (neuprint-python, navis, Brian2). Choose a neuron below to see its 3D model.',
    flyPlaceholder: 'Ask about the fly brain, neurons, synapses...',
    flyNeedServer: 'The fly tab works through the support server (backend). Connect it, and the connectome chat and 3D will turn on.',
    flyFail8: 'The connectome server is not responding right now. Try again in a moment.',
    flyViewerLoad: 'Loading the 3D neuron model...',
    flyViewerOk: 'Real neuron from NeuPrint. Rotate by dragging, zoom with the wheel.',
    flyViewerDemo: 'Demo neuron (NeuPrint is offline). Rotate by dragging, zoom with the wheel.',
    flyViewerFail: '3D rendering is not available in this environment.',
    flyLoadBtn: 'Show',
    flyTypesLabel: 'Type and brain region',
    flyStack: 'Experimental alpha feature · stack: flyconnectome/NeuPrint · navis · Brian2/NEST · PyTorch/TensorFlow'
  } : {
    title: 'Ассистент сайта',
    status: 'отвечаю по реальным данным',
    input: 'Спросите о товарах, доставке, возврате…',
    send: 'Отправить',
    fallback: 'Не нашёл точного ответа на этой странице. Уточните вопрос или свяжитесь с нами напрямую.',
    chips: 'Частые вопросы',
    source: 'Источник',
    close: 'Закрыть',
    preview: 'Привет! Я ИИ-агент этого сайта. Спросите меня о товарах, доставке или возврате.',
    operator: 'Оператор',
    handoff: 'Переключаю вас на оператора поддержки. Он ответит здесь или на вашу почту.',
    operatorWait: 'Сообщение передано оператору. Он ответит здесь или на вашу почту.',
    offlineOperator: 'Свяжитесь с нами напрямую: ',
    emailAsk: 'Оставьте ваш email, чтобы мы могли ответить, даже если вы закроете эту вкладку:',
    emailSkip: 'Хорошо, продолжим без email — ответы появятся прямо в этом чате.',
    emailDone: 'Спасибо! Теперь ответы могут приходить и на вашу почту.',
    emailBad: 'Похоже, это не email. Введите почту ещё раз:',
    ratingAsk: 'Как вы оцените ответы агента?',
    ratingDone: 'Спасибо за вашу оценку!',
    operatorBtn: 'Позвать оператора',
    backBtn: 'Вернуть ИИ',
    operatorsOff: 'Сейчас операторы отключены — на все вопросы отвечает только ИИ-агент. Уточните вопрос, и я продолжу помогать.',
    checkinAsk: 'Ваш вопрос решён?',
    checkinYes: 'Да, решено',
    checkinNo: 'Нет, нужна помощь',
    checkinNoMsg: 'Хорошо, продолжим вместе — уточните вопрос или я подключу оператора.',
    continueBtn: 'Продолжить с ИИ',
    checkinThanks: 'Отлично! Спасибо. Если понадобится — я рядом.',
    resumeMsg: 'Возвращаюсь к ИИ-агенту — могу сразу ответить на новые вопросы.',
    resolveClose: 'Тикет закрыт. Спасибо за обращение!',
    tabChat: 'Чат',
    tabFly: 'Муха',
    flyGreeting: 'Привет! Я чат про оцифрованный мозг плодовой мухи (Drosophila melanogaster) — коннектом. Спросите, сколько в нём нейронов, про синапсы, клетки Кеньона, MBON или инструменты (neuprint-python, navis, Brian2). А ниже выберите нейрон, чтобы посмотреть его 3D-модель.',
    flyPlaceholder: 'Спросите про мозг мухи, нейроны, синапсы…',
    flyNeedServer: 'Вкладка «Муха» работает через сервер поддержки (backend). Подключите его — и заработают чат про коннектом и 3D.',
    flyFail8: 'Сервер коннектома сейчас не отвечает. Попробуйте чуть позже.',
    flyViewerLoad: 'Загружаю 3D-модель нейрона…',
    flyViewerOk: 'Реальный нейрон из NeuPrint. Вращайте перетаскиванием, масштаб — колесом.',
    flyViewerDemo: 'Демо-нейрон (NeuPrint недоступен). Вращайте перетаскиванием, масштаб — колесом.',
    flyViewerFail: 'В этой среде 3D-рендер недоступен.',
    flyLoadBtn: 'Показать',
    flyTypesLabel: 'Тип и доля нейронов',
    flyStack: 'Экспериментальная альфа-фича · стек: flyconnectome/NeuPrint · navis · Brian2/NEST · PyTorch/TensorFlow'
  };

  var PALETTE = { primary: '#2563eb', accent: '#312e81', bg: '#ffffff', fg: '#111827', font: 'system-ui', radius: 14, dark: false, logo: '' };

  function cssVar(el, name) {
    var v = getComputedStyle(el).getPropertyValue(name);
    return v ? v.trim() : '';
  }

  function rgbToHex(color) {
    var m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return '';
    var p = m[1].split(',').map(function (x) { return Math.round(parseFloat(x.trim())); });
    function h(n) { var s = n.toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + h(p[0]) + h(p[1]) + h(p[2]);
  }

  function luminance(hex) {
    var m = hex.replace('#', '');
    if (m.length === 3) m = m.split('').map(function (c) { return c + c; }).join('');
    if (m.length < 6) return 1;
    var r = parseInt(m.substr(0, 2), 16);
    var g = parseInt(m.substr(2, 2), 16);
    var b = parseInt(m.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function shade(hex, pct) {
    var m = hex.replace('#', '');
    if (m.length === 3) m = m.split('').map(function (c) { return c + c; }).join('');
    var n = [parseInt(m.substr(0, 2), 16), parseInt(m.substr(2, 2), 16), parseInt(m.substr(4, 2), 16)];
    var out = n.map(function (v) {
      var x = pct >= 0 ? Math.round(v * (1 - pct)) : Math.round(v + (255 - v) * Math.abs(pct));
      return Math.max(0, Math.min(255, x));
    });
    function hh(v) { var s = v.toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + hh(out[0]) + hh(out[1]) + hh(out[2]);
  }

  function hexA(hex, a) {
    var m = String(hex).replace('#', '');
    if (m.length === 3) m = m.split('').map(function (c) { return c + c; }).join('');
    if (m.length < 6) return hex;
    var r = parseInt(m.substr(0, 2), 16), g = parseInt(m.substr(2, 2), 16), b = parseInt(m.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function plausible(c) { return /^#[0-9a-f]{3,8}$/i.test(c); }

  var GENERIC_FONTS = { 'system-ui': 1, 'ui-sans-serif': 1, 'ui-serif': 1, 'ui-monospace': 1, 'sans-serif': 1, 'serif': 1, 'monospace': 1, 'cursive': 1, 'fantasy': 1, 'initial': 1, 'inherit': 1, 'unset': 1, 'revert': 1, 'revert-layer': 1, 'auto': 1 };
  var GENERIC_FONT_NAMES = { 'arial': 1, 'helvetica': 1, 'verdana': 1, 'tahoma': 1, 'times new roman': 1, 'courier new': 1 };

  // Подбираем шрифт из стека шрифтов страницы, пропуская системные/обобщённые.
  function pickPageFont() {
    var stack = String(getComputedStyle(document.body).fontFamily || 'system-ui').replace(/["']/g, '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < stack.length; i++) {
      var name = stack[i];
      if (name && !GENERIC_FONTS[name.toLowerCase()] && !GENERIC_FONT_NAMES[name.toLowerCase()]) return name;
    }
    return stack[0] || 'system-ui';
  }

  // Масштаб текста виджета относительно базового шрифта страницы (адаптация по шрифтам).
  function computeFontAdapt() {
    try {
      var rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      var bodyFs = parseFloat(getComputedStyle(document.body).fontSize) || rootFs;
      return Math.min(1.35, Math.max(0.8, bodyFs / 16));
    } catch (e) { return 1; }
  }

  function extractStyle() {
    PALETTE.found = false;
    var rootEl = document.documentElement;
    var VARS = ['--brand', '--primary', '--accent', '--color-primary', '--color-accent', '--main-color', '--site-color'];
    var i, v;
    for (i = 0; i < VARS.length; i++) {
      v = cssVar(rootEl, VARS[i]);
      if (plausible(v)) { PALETTE.primary = v; PALETTE.found = true; break; }
    }
    if (!plausible(PALETTE.primary)) {
      var lnk = document.querySelector('a');
      if (lnk) { var c = rgbToHex(getComputedStyle(lnk).color); if (plausible(c)) { PALETTE.primary = c; PALETTE.found = true; } }
    }
    var acc = cssVar(rootEl, '--accent');
    PALETTE.accent = plausible(acc) ? acc : shade(PALETTE.primary, 0.55);
    if (!plausible(PALETTE.primary)) PALETTE.primary = '#2563eb';

    var bodyColor = rgbToHex(getComputedStyle(document.body).backgroundColor);
    if (plausible(bodyColor) && bodyColor !== '#ffffff') PALETTE.bg = bodyColor;
    PALETTE.dark = luminance(PALETTE.bg) < 0.45;
    PALETTE.fg = PALETTE.dark ? '#f3f4f6' : '#111827';
    PALETTE.font = pickPageFont();
    var btnList = document.querySelectorAll('button, .btn, a[class*="btn"]');
    for (var bi = 0; bi < btnList.length; bi++) {
      var b = btnList[bi];
      var bw = b.offsetWidth || 0;
      if (bw && bw < 48) continue;
      var r = parseInt(getComputedStyle(b).borderRadius, 10);
      if (!isNaN(r) && r > 0) { PALETTE.radius = Math.min(26, r); break; }
    }
    var img = document.querySelector('header img, .logo img, nav img');
    if (img && img.src && img.src.indexOf('data:') !== 0) PALETTE.logo = img.src;
  }

  function nodeText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  var KNOW = [];

  function addItem(title, content, urls) {
    if (!content) return;
    content = String(content).replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!content) return;
    KNOW.push({ title: String(title || 'Информация'), content: content, urls: urls || [] });
  }

  function extractJsonLd() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    var s, list, o;
    for (s = 0; s < scripts.length; s++) {
      var obj;
      try { obj = JSON.parse(scripts[s].textContent); } catch (e) { continue; }
      if (!obj || typeof obj !== 'object') continue;
      list = obj['@graph'] || [obj];
      for (var y = 0; y < list.length; y++) {
        o = list[y];
        if (!o || typeof o !== 'object') continue;
        var type = o['@type'] || '';
        if (type === 'Product' && o.name) {
          var price = o.offers && o.offers.price ? ' Цена: ' + o.offers.price + (o.offers.priceCurrency || '').toUpperCase() + '.' : '';
          addItem(o.name, (o.description || 'Описание не указано.') + price);
        } else if (type === 'FAQPage' && o.mainEntity) {
          for (var q = 0; q < o.mainEntity.length; q++) {
            if (o.mainEntity[q] && o.mainEntity[q].name) addItem(o.mainEntity[q].name, o.mainEntity[q].acceptedAnswer ? o.mainEntity[q].acceptedAnswer.text : '');
          }
        } else if (type === 'Organization') {
          addItem(o.name + ' — контакты', [o.address, o.telephone, o.email].filter(Boolean).join(', '));
        } else if (o.name || o.headline) {
          addItem(o.name || o.headline, o.description || o.text || '');
        }
      }
    }
  }

  function extractHeadings() {
    var hs = document.querySelectorAll('h1, h2, h3');
    var i, guard, next, parts;
    for (i = 0; i < hs.length; i++) {
      var title = nodeText(hs[i]);
      if (!title || title.length < 4) continue;
      var dup = false;
      for (guard = 0; guard < KNOW.length; guard++) { if (KNOW[guard].title === title) { dup = true; break; } }
      if (dup) continue;
      next = hs[i].nextElementSibling;
      parts = [];
      guard = 0;
      while (next && !/^H[1-3]$/.test(next.tagName) && guard < 6) {
        parts.push(nodeText(next));
        next = next.nextElementSibling;
        guard++;
      }
      addItem(title, parts.join(' '));
    }
  }

  function extractFaq() {
    var els = document.querySelectorAll('[class*="faq"], [data-faq]');
    var i, j;
    for (i = 0; i < els.length; i++) {
      var children = els[i].querySelectorAll('dt, h3, h4, [class*="question"], [data-question]');
      for (j = 0; j < children.length; j++) {
        var q = nodeText(children[j]);
        if (!q) continue;
        var ans = '';
        var aEl = children[j].nextElementSibling;
        var g = 0;
        while (aEl && !/^H[1-4]$/.test(aEl.tagName) && g < 4) {
          ans += nodeText(aEl) + ' ';
          aEl = aEl.nextElementSibling;
          g++;
        }
        addItem(q, ans);
      }
    }
  }

  function extractProducts() {
    var els = document.querySelectorAll('[class*="product"], [class*="card"], [data-product]');
    var i;
    for (i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.getAttribute('data-name') || nodeText(el.querySelector('[class*="name"], h3, h4')) || el.getAttribute('alt') || '';
      if (!name) { var img = el.querySelector('img'); if (img && img.alt) name = img.alt; }
      if (!name) continue;
      var price = el.getAttribute('data-price') || nodeText(el.querySelector('[class*="price"], [class*="cost"]'));
      addItem(name, (price ? 'Цена: ' + price.trim() + '.' : '') + (el.getAttribute('data-desc') ? ' ' + el.getAttribute('data-desc') : ''));
    }
  }

  function extractLinks() {
    var links = document.querySelectorAll('a');
    var seen = {};
    var items = [];
    var href, txt, i;
    for (i = 0; i < links.length; i++) {
      txt = (nodeText(links[i]) || links[i].getAttribute('aria-label') || '').trim();
      href = links[i].getAttribute('href') || '';
      if (txt && txt.length < 60 && !seen[txt] && href && href.indexOf('javascript') !== 0) {
        seen[txt] = 1;
        items.push(txt + ' — ' + href);
      }
    }
    if (items.length) addItem('Разделы сайта', items.slice(0, 30).join(' · '));
    var mails = [];
    var tels = [];
    var a;
    for (i = 0; i < links.length; i++) {
      a = links[i];
      if (a.getAttribute('href') && a.getAttribute('href').indexOf('mailto:') === 0) mails.push(a.getAttribute('href').replace('mailto:', ''));
      if (a.getAttribute('href') && a.getAttribute('href').indexOf('tel:') === 0) tels.push(a.getAttribute('href').replace('tel:', ''));
    }
    if (mails.length || tels.length) addItem('Контакты', mails.concat(tels).join(', '));
  }

  var IMAGE_LIST = [];

  function extractImages() {
    if (!CONFIG.readImages) return;
    var imgs = document.querySelectorAll('img');
    var seenSrc = {};
    var i, im, alt, w, src, parent, name, title, j, hit;
    for (i = 0; i < imgs.length && IMAGE_LIST.length < 12; i++) {
      im = imgs[i];
      src = im.currentSrc || im.src || '';
      if (!src) continue;
      w = im.offsetWidth || im.naturalWidth || 0;
      if (w && w < 48) continue;
      alt = (im.alt || '').trim();
      parent = im.closest ? im.closest('[data-name]') : null;
      name = parent ? String(parent.getAttribute('data-name') || '') : '';
      if (!alt && !name) continue;
      if (seenSrc[src]) continue;
      title = (alt || name || '').slice(0, 80);
      const short = src.indexOf('data:') === 0 ? src.slice(0, 120) : src;
      hit = null;
      for (j = 0; j < KNOW.length; j++) { if (KNOW[j].title === title) { hit = KNOW[j]; break; } }
      if (hit) {
        if (hit.urls.length < 5) hit.urls.push(short);
        seenSrc[src] = 1;
        continue;
      }
      seenSrc[src] = 1;
      IMAGE_LIST.push({ alt: alt, src: src });
      addItem(title || 'Изображение сайта', 'Изображение сайта: ' + (alt || title || 'без подписи') + '. Ссылка: ' + short, [short]);
    }
  }

  function buildKnowledge() {
    addItem('О сайте', document.querySelector('meta[name="description"]') ? document.querySelector('meta[name="description"]').getAttribute('content') : '');
    extractJsonLd();
    extractHeadings();
    extractFaq();
    extractProducts();
    extractImages();
    extractLinks();
    while (KNOW.length > 60) KNOW.pop();
  }

  var STOP = new Set('и,в,на,с,у,о,об,по,за,из,от,до,к,для,что,как,где,когда,почему,зачем,это,то,все,если,но,или,при,можно,не,уж,ли,есть,уже,было,будет,будут,а,так,ведь,вот,да,нет,его,её,их,мой,меня,вас,ваш,этот,эта,это,сколько'.split(','));
  var IDX = {};

  function tokenize(t) {
    return String(t || '').toLowerCase().replace(/[^a-zа-яё0-9\.\-@\s]/gi, ' ').split(/\s+/).filter(function (w) { return w.length > 1; });
  }

  function terms(t) {
    return tokenize(t).filter(function (w) { return !STOP.has(w); });
  }

  function uniqueArr(a) {
    var o = {};
    a.forEach(function (x) { o[x] = 1; });
    return Object.keys(o);
  }

  function indexKnowledge() {
    var i, tokens;
    for (i = 0; i < KNOW.length; i++) {
      tokens = uniqueArr(tokenize(KNOW[i].title).concat(tokenize(KNOW[i].content)));
      KNOW[i]._t = new Set(tokenize(KNOW[i].title));
      KNOW[i]._a = new Set(tokens);
    }
    for (i = 0; i < KNOW.length; i++) {
      tokens.forEach(function (w) {
        if (!IDX[w]) IDX[w] = [];
        IDX[w].push(i);
      });
    }
  }

  function findBest(q) {
    q = uniqueArr(terms(q));
    if (!q.length) return null;
    var results = [];
    var total = q.length;
    KNOW.forEach(function (item, idx) {
      var matched = 0;
      q.forEach(function (w) {
        if (item._t.has(w) || item._a.has(w)) matched++;
      });
      if (!matched) return;
      var conf = matched / total;
      results.push({ idx: idx, item: item, conf: conf, matched: matched });
    });
    results.sort(function (a, b) { return (b.conf - a.conf) || (b.matched - a.matched); });
    var best = results[0];
    if (!best) return null;
    if (best.conf < 0.35 && best.matched < 2) {
      var second = results[1];
      if (second && second.matched >= 2) return second;
    }
    return best;
  }

  function context(q) {
    var queryTerms = uniqueArr(terms(q));
    var scored = [];
    var i, j, matched;
    for (i = 0; i < KNOW.length; i++) {
      matched = 0;
      for (j = 0; j < queryTerms.length; j++) {
        if (KNOW[i]._t.has(queryTerms[j]) || KNOW[i]._a.has(queryTerms[j])) matched++;
      }
      if (matched > 0) scored.push({ idx: i, m: matched });
    }
    scored.sort(function (a, b) { return b.m - a.m; });
    if (!scored.length) {
      for (i = 0; i < Math.min(6, KNOW.length); i++) scored.push({ idx: i, m: 0 });
    }
    var ids = scored.slice(0, 6).map(function (s) { return s.idx; });
    return ids.map(function (id) { return '[' + KNOW[id].title + '] ' + KNOW[id].content; }).join('\n\n');
  }

  function systemPromptBase(q) {
    return 'Ты — ИИ-агент сайта «' + CONFIG.siteName + '». Отвечай кратко, дружелюбно, только на основе данных сайта. Если ответа нет — честно скажи, что не знаешь, и предложи связаться с поддержкой.\n\nДанные сайта:\n' + context(q);
  }

  function aiAnswer(q) {
    if (!CONFIG.aiEnabled) return Promise.resolve(null);
    var sysMsg = systemPromptBase(q);
    if (CONFIG.instructions) sysMsg += '\n\nДополнительные инструкции от поддержки:\n' + CONFIG.instructions;
    var headers = { 'Content-Type': 'application/json' };
    if (CONFIG.apiKey) headers['Authorization'] = 'Bearer ' + CONFIG.apiKey;
    return fetch(BACKEND.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: BACKEND.model,
        messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: q }],
        temperature: 0.3
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('api error');
      return r.json();
    }).then(function (data) {
      return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
    }).catch(function () { return null; });
  }

  function maybeDescribeImages() {
    if (!CONFIG.vision || !IMAGE_LIST.length) return Promise.resolve(null);
    var parts = [{ type: 'text', text: 'Опиши одним коротким абзацем, что изображено на картинках этого сайта. Укажи цвета и стиль, если заметишь.' }];
    IMAGE_LIST.slice(0, 4).forEach(function (img) {
      parts.push({ type: 'image_url', image_url: { url: img.src } });
    });
    var headers = { 'Content-Type': 'application/json' };
    if (CONFIG.apiKey) headers['Authorization'] = 'Bearer ' + CONFIG.apiKey;
    return fetch(BACKEND.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: BACKEND.model, messages: [{ role: 'user', content: parts }], temperature: 0.3 })
    }).then(function (r) {
      if (!r.ok) throw new Error('api error');
      return r.json();
    }).then(function (data) {
      var t = data.choices && data.choices[0] && data.choices[0].message ? String(data.choices[0].message.content || '').trim() : '';
      if (!t) return null;
      addItem('Описание изображений', t.slice(0, 800));
      indexKnowledge();
      return t;
    }).catch(function () { return null; });
  }

  function aiSuggestStyle() {
    var sys = 'Ты — стилист веб-сайтов. По описанию страницы подбери фирменную палитру. Ответь ТОЛЬКО валидным JSON без текста вокруг, вида {"primary":"#...","accent":"#...","bg":"#...","dark":true|false,"radius":12}. primary и accent — контрастные современные цвета, bg — цвет фона страницы, dark — тёмная тема ли это, radius — скругление (0-30).';
    var headers = { 'Content-Type': 'application/json' };
    if (CONFIG.apiKey) headers['Authorization'] = 'Bearer ' + CONFIG.apiKey;
    return fetch(BACKEND.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: BACKEND.model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: 'Страница: ' + CONFIG.siteName + '\n\n' + context('о сайте') }],
        temperature: 0.4
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('api error');
      return r.json();
    }).then(function (data) {
      var txt = data.choices && data.choices[0] && data.choices[0].message ? String(data.choices[0].message.content || '') : '';
      var m = txt.match(/\{[^]*\}/);
      if (!m) throw new Error('no json');
      var o = JSON.parse(m[0]);
      if (!o || !plausible(o.primary) || !plausible(o.accent) || !plausible(o.bg)) throw new Error('bad palette');
      PALETTE.primary = o.primary;
      PALETTE.accent = o.accent;
      PALETTE.bg = o.bg;
      PALETTE.dark = !!o.dark;
      PALETTE.fg = PALETTE.dark ? '#f3f4f6' : '#111827';
      if (isFinite(o.radius) && o.radius > 0 && o.radius <= 30) PALETTE.radius = Math.round(o.radius);
      PALETTE._ai = true;
      return o;
    }).catch(function () { return null; }).then(function () { if (host) applyPalette(); else buildUI(); });
  }

  function answerText(q) {
    var best = findBest(q);
    if (!best) return { text: T.fallback, best: null };
    var out = best.item.content;
    if (best.item.urls.length) {
      out += '\n\n' + T.source + ': ' + best.item.urls.join(', ');
    }
    return { text: out, best: best.item };
  }

  var host, shadow, sendBtn, inputEl, msgEl, panelEl, toggleBtn, teaserEl, chipsEl;
var vpBound = false;

  var SVG_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 8v-1M9 3l1.5 4M15 3l-1.5 4"/><circle cx="9.2" cy="12.6" r="1"/><circle cx="14.8" cy="12.6" r="1"/><path d="M9.5 16.2c.8.6 4 .6 5 0"/></svg>';
  var SVG_SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  var SVG_CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var SVG_OP = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="13" width="4" height="6" rx="1.5"/><rect x="17.5" y="13" width="4" height="6" rx="1.5"/></svg>';

  function cssText() {
    var dark = PALETTE.dark;
    var panelBg = dark ? '#1f2430' : '#ffffff';
    var panelText = dark ? '#f3f4f6' : '#111827';
    var sub = dark ? '#9aa3b2' : '#6b7280';
    var chipBg = dark ? '#2b3242' : '#f1f5f9';
    var chipText = dark ? '#dbe2ec' : '#374151';
    var accentDark = shade(PALETTE.accent, 0.15);
    return [
      ':host{all:initial;--pw-ad:1;}',
      '*{box-sizing:border-box;font-family:var(--pw-font),system-ui,sans-serif;}',
      '.fab{position:fixed;' + (CONFIG.position === 'left' ? 'left:20px' : 'right:20px') + ';bottom:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;z-index:2147483000;',
      'background:linear-gradient(135deg,' + PALETTE.primary + ',' + PALETTE.accent + ');box-shadow:0 8px 24px rgba(0,0,0,.25);transition:transform .32s cubic-bezier(.34,1.56,.64,1),box-shadow .4s ease,width .25s ease,height .25s ease;will-change:transform;padding:0;}',
      '.fab:hover{transform:scale(1.08);}',
      '.fab:active{transform:scale(.96);}',
      '.fab .halo{position:absolute;inset:-4px;border-radius:50%;border:2px solid ' + PALETTE.accent + ';opacity:0;pointer-events:none;}',
      '.fab.new .halo{animation:haloPulse 2.2s cubic-bezier(.22,1,.36,1) infinite;}',
      '@keyframes haloPulse{0%{transform:scale(.9);opacity:.9}70%{transform:scale(1.35);opacity:0}100%{opacity:0}}',
      '.fab .ubadge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;line-height:18px;text-align:center;padding:0 5px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3);display:none;align-items:center;justify-content:center;}',
      '.panel{position:fixed;' + (CONFIG.position === 'left' ? 'left:20px' : 'right:20px') + ';bottom:88px;width:min(380px,calc(100vw - 32px));height:min(560px,calc(var(--pw-vh,100vh) - 120px));max-height:calc(var(--pw-vh,100vh) - 120px);',
      'background:' + panelBg + ';color:' + panelText + ';border-radius:' + (PALETTE.radius + 6) + 'px;overflow:hidden;display:flex;flex-direction:column;z-index:2147483001;',
      'box-shadow:0 20px 60px rgba(0,0,0,.3);border:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';',
      'transform:translateY(18px) scale(.97);opacity:0;pointer-events:none;transform-origin:bottom ' + (CONFIG.position === 'left' ? 'left' : 'right') + ';',
      'transition:transform .42s cubic-bezier(.22,1,.36,1),opacity .32s ease,background .4s ease,border-color .4s ease;',
      'will-change:transform,opacity;font-size:14px;line-height:1.5;}',
      '.panel.open{transform:none;opacity:1;pointer-events:auto;}',
      ':host([data-theme-anim]) .fab{animation:themeSwap .6s cubic-bezier(.22,1,.36,1);}',
      ':host([data-theme-anim]) .panel.open{animation:themePop .6s cubic-bezier(.22,1,.36,1);}',
      '@keyframes themeSwap{0%{filter:saturate(1.6) brightness(1.08)}100%{filter:none}}',
      '@keyframes themePop{0%{opacity:.55;filter:saturate(1.4) brightness(1.05)}100%{opacity:1;filter:none}}',
      /* Автомасштабирование под окно */
      '@media (max-width:600px){.panel{left:12px;right:12px;bottom:84px;width:auto;height:min(560px,calc(var(--pw-vh,100vh) - 104px));}}',
      '@media (max-width:460px){.panel{left:0;right:0;bottom:0;top:0;width:100vw;height:100vh;max-height:100vh;border-radius:0;border:none;transform-origin:bottom center;}.fab{bottom:16px;width:52px;height:52px;}.teaser{bottom:80px;max-width:calc(100vw - 32px);}}',
      '@media (max-height:480px){.panel{bottom:76px;height:calc(var(--pw-vh,100vh) - 92px);max-height:calc(var(--pw-vh,100vh) - 92px);}}',
      '@media (prefers-reduced-motion:reduce){.fab,.panel,.b,.chip,.stars button{transition-duration:.001ms!important;animation-duration:.001ms!important;}.fab.new .halo{animation:none;}}',
      '.head{display:flex;align-items:center;gap:10px;padding:14px 16px;color:#fff;',
      'background:linear-gradient(120deg,' + PALETTE.primary + ',' + accentDark + ');}',
      '.head .ava{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex:0 0 36px;}',
      '.head .titles{flex:1;min-width:0;}',
      '.head .t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.head .s{font-size:11.5px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.close{background:none;border:none;color:#fff;cursor:pointer;opacity:.8;padding:4px;}',
      '.close:hover{opacity:1;}',
      '.op-btn{background:none;border:none;color:#fff;cursor:pointer;opacity:.85;padding:4px;flex:0 0 auto;}',
      '.op-btn:hover{opacity:1;}',
      '.op-btn.on{opacity:1;padding:3px;border-radius:8px;background:rgba(255,255,255,.18);}',
      '.chips{padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';}',
      '.chips .lbl{width:100%;font-size:11.5px;color:' + sub + ';margin-bottom:2px;}',
      '.chip{border:1px solid ' + (dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)') + ';background:' + chipBg + ';color:' + chipText + ';border-radius:100px;padding:5px 11px;font-size:12.5px;cursor:pointer;transition:background .22s ease,color .22s ease,border-color .22s ease,transform .22s cubic-bezier(.34,1.56,.64,1);}',
      '.chip:hover{background:' + (dark ? '#374151' : '#e2e8f0') + ';border-color:' + PALETTE.primary + ';color:' + PALETTE.primary + ';transform:translateY(-1px);}',
      '.msgs{flex:1;overflow-y:auto;padding:14px 14px 4px;scroll-behavior:smooth;}',
      '.b{display:flex;margin-bottom:10px;animation:msgIn .45s cubic-bezier(.22,1,.36,1) both;}',
      '@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '.b .av{width:28px;height:28px;border-radius:50%;flex:0 0 28px;margin-right:8px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,' + PALETTE.primary + ',' + PALETTE.accent + ');}',
      '.b.user{justify-content:flex-end;}',
      '.b .m{max-width:78%;padding:9px 13px;border-radius:14px;white-space:pre-wrap;word-break:break-word;}',
      '.b.bot .m{background:' + (dark ? '#2b3242' : '#f1f5f9') + ';border-top-left-radius:4px;}',
      '.b.user .m{background:linear-gradient(135deg,' + PALETTE.primary + ',' + accentDark + ');color:#fff;border-top-right-radius:4px;}',
      '.b .name{font-size:10.5px;color:' + sub + ';margin-bottom:2px;padding-left:2px;}',
      '.stars{background:' + (dark ? '#2b3242' : '#f1f5f9') + ';border-radius:14px;border-top-left-radius:4px;padding:9px 13px;max-width:78%;}',
      '.stars .lbl{font-size:12px;margin-bottom:5px;}',
      '.stars button{background:none;border:none;cursor:pointer;font-size:22px;line-height:1;color:#cbd5e1;padding:0 3px;transition:color .2s ease,transform .22s cubic-bezier(.34,1.56,.64,1);}',
      '.stars button:hover,.stars button.on{color:#fbbf24;transform:scale(1.15);}',
      '.m .hl{color:' + (dark ? '#93c5fd' : PALETTE.primary) + ';font-weight:600;text-decoration:none;border-bottom:1px solid ' + hexA(PALETTE.primary, .35) + ';}',
      '.quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}',
      '.quick button{border:1px solid ' + hexA(PALETTE.primary, .4) + ';background:' + hexA(PALETTE.primary, .1) + ';color:' + (dark ? '#dbeafe' : PALETTE.primary) + ';border-radius:100px;padding:6px 12px;font-size:12.5px;cursor:pointer;transition:background .22s ease,transform .22s cubic-bezier(.34,1.56,.64,1);}',
      '.quick button:hover{background:' + hexA(PALETTE.primary, .2) + ';transform:translateY(-1px);}',
      '.foot{display:flex;gap:8px;padding:10px 12px;border-top:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';}',
      '.foot button{flex:1;border-radius:10px;padding:9px 10px;font-size:12.5px;cursor:pointer;border:1px solid transparent;transition:background .22s ease,color .22s ease,border-color .22s ease,transform .22s cubic-bezier(.34,1.56,.64,1);}',
      '.foot button:active{transform:scale(.98);}',
      '.foot .call{border-color:' + hexA(PALETTE.primary, .5) + ';background:' + hexA(PALETTE.primary, .12) + ';color:' + (dark ? '#dbeafe' : PALETTE.primary) + ';}',
      '.foot .call:hover{background:' + hexA(PALETTE.primary, .22) + ';}',
      '.foot .back{border-color:' + (dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)') + ';background:transparent;color:' + sub + ';display:none;}',
      '.foot .back:hover{color:' + panelText + ';border-color:' + PALETTE.primary + ';}',
      ':host([data-human]) .foot .call{display:none;}',
      ':host([data-human]) .foot .back{display:block;}',
      ':host([data-noop]) .foot{display:none;}',
      '.dots span{display:inline-block;width:6px;height:6px;margin-right:3px;background:' + sub + ';border-radius:50%;animation:blink 1.2s infinite;}',
      '.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}',
      '@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}',
      '.input,.finput{display:flex;gap:8px;padding:12px;border-top:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';}',
      '.input input,.finput input{flex:1;border:1px solid ' + (dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.14)') + ';background:transparent;color:' + panelText + ';border-radius:12px;padding:10px 12px;outline:none;font-size:14px;transition:border-color .25s ease,box-shadow .25s ease;}',
      '.input input:focus,.finput input:focus{border-color:' + PALETTE.primary + ';box-shadow:0 0 0 3px ' + hexA(PALETTE.primary, .15) + ';}',
      '.input button,.finput button{border:none;background:linear-gradient(135deg,' + PALETTE.primary + ',' + accentDark + ');color:#fff;border-radius:12px;width:44px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 44px;padding:0;}',
      '.input button:hover,.finput button:hover{filter:brightness(1.08);}',
      '.teaser{position:fixed;' + (CONFIG.position === 'left' ? 'left:20px' : 'right:20px') + ';bottom:88px;background:' + panelBg + ';color:' + panelText + ';border-radius:16px;padding:12px 14px;max-width:280px;box-shadow:0 12px 40px rgba(0,0,0,.22);font-size:13.5px;z-index:2147482999;cursor:pointer;border:1px solid ' + (dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.06)') + ';}',
      '.teaser b{color:' + PALETTE.primary + ';}',
      '.teaser .x{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;border:none;background:' + sub + ';color:#fff;cursor:pointer;font-size:11px;line-height:1;}',
      '.tabs{display:flex;gap:4px;padding:6px 12px 0;border-bottom:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';}',
      '.tab{flex:1;border:none;background:none;color:' + sub + ';font-size:13px;font-weight:600;padding:8px 6px;cursor:pointer;border-radius:10px 10px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s ease,background .2s ease;}',
      '.tab:hover{color:' + panelText + ';}',
      '.tab.on{color:' + (dark ? '#ffffff' : PALETTE.primary) + ';background:' + hexA(PALETTE.primary, .08) + ';box-shadow:inset 0 -2px 0 ' + PALETTE.primary + ';}',
      ':host([data-nofly]) .tab[data-tab="fly"],:host([data-nofly]) .viewp[data-view="fly"]{display:none!important;}',
      '.viewp{flex:1;min-height:0;display:flex;flex-direction:column;}',
      '.fops{display:flex;gap:8px;padding:8px 12px;align-items:center;border-bottom:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';}',
      '.fops select{flex:1;min-width:0;border:1px solid ' + (dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.14)') + ';background:' + (dark ? '#2b3242' : '#ffffff') + ';color:' + panelText + ';border-radius:10px;padding:8px 10px;font-size:12.5px;outline:none;max-width:60%;}',
      '.fops button{border:1px solid ' + hexA(PALETTE.primary, .5) + ';background:' + hexA(PALETTE.primary, .12) + ';color:' + (dark ? '#dbeafe' : PALETTE.primary) + ';border-radius:10px;padding:8px 12px;font-size:12.5px;cursor:pointer;transition:background .22s ease,transform .22s cubic-bezier(.34,1.56,.64,1);}',
      '.fops button:hover{background:' + hexA(PALETTE.primary, .22) + ';transform:translateY(-1px);}',
      '.fcanvas{position:relative;height:185px;border-bottom:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';background:' + (dark ? '#161a23' : '#f8fafc') + ';overflow:hidden;flex:0 0 185px;}',
      '.fcanvas canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;}',
      '.fph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:' + sub + ';font-size:12.5px;text-align:center;padding:0 14px;z-index:1;pointer-events:none;}',
      '.fph .lbl{font-weight:600;color:' + panelText + ';font-size:13px;}',
      '.fmsgs{flex:1;overflow-y:auto;padding:12px 12px 4px;scroll-behavior:smooth;}',
      '.fmsgs .b .m{max-width:92%;}',
      '.flybar{position:absolute;top:8px;right:8px;z-index:2;}',
      '.flybar button{border:1px solid ' + (dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)') + ';background:' + (dark ? '#2b3242' : '#ffffff') + ';color:' + sub + ';border-radius:8px;padding:4px 8px;font-size:11.5px;cursor:pointer;}',
      '.fstack{padding:8px 12px;font-size:11px;line-height:1.35;color:' + sub + ';border-bottom:1px solid ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)') + ';background:' + hexA(PALETTE.primary, .04) + ';}'
    ].join('\n') + fontAdaptCss();
  }

  // Адаптация текста к базовому шрифту страницы через --pw-ad (выставляется JS).
  function fontAdaptCss() {
    var ad = 'var(--pw-ad)';
    return '\n' +
      '.b .m{font-size:max(13px,calc(16px * ' + ad + '));}' +
      '.head .t{font-size:max(13px,calc(16px * ' + ad + '));}' +
      '.head .s,.chips .lbl{font-size:max(10px,calc(11.5px * ' + ad + '));}' +
      '.chip,.quick button,.foot button,.fops button,.flybar button{font-size:max(10.5px,calc(12.5px * ' + ad + '));}' +
      '.input input,.finput input{font-size:max(12px,calc(14px * ' + ad + '));}' +
      '.tab{font-size:max(11px,calc(13px * ' + ad + '));}' +
      '.teaser{font-size:max(11.5px,calc(13.5px * ' + ad + '));}' +
      '.b .name{font-size:max(9px,calc(10.5px * ' + ad + '));}' +
      '.stars .lbl{font-size:max(10px,calc(12px * ' + ad + '));}' +
      '.fph .lbl{font-size:max(11px,calc(13px * ' + ad + '));}';
  }

  function markup() {
    return '<button class="fab" title="' + T.title + '" aria-label="' + T.title + '">' + SVG_ICON + '<span class="halo"></span><span class="ubadge" style="display:none">0</span></button>' +
      '<div class="teaser" style="display:none">' + safeHtml(CONFIG.teaser || T.preview) + '<button class="x">✕</button></div>' +
      '<div class="panel">' +
      '<div class="head">' +
      '<div class="ava">' + SVG_ICON + '</div>' +
      '<div class="titles"><div class="t">' + T.title + '</div><div class="s">' + T.status + '</div></div>' +
      '<button class="close" aria-label="' + T.close + '">' + SVG_CLOSE + '</button>' +
      '</div>' +
      '<div class="tabs"><button class="tab on" data-tab="chat">' + T.tabChat + '</button><button class="tab" data-tab="fly">' + T.tabFly + '</button></div>' +
      '<div class="viewp" data-view="chat">' +
      '<div class="chips"><div class="lbl">' + T.chips + '</div><div data-chips></div></div>' +
      '<div class="msgs"></div>' +
      '<div class="foot"><button class="call" data-op>' + T.operatorBtn + '</button><button class="back" data-ai>' + T.backBtn + '</button></div>' +
      '<div class="input"><input type="text" placeholder="' + T.input + '"><button aria-label="' + T.send + '">' + SVG_SEND + '</button></div>' +
      '</div>' +
      '<div class="viewp fly" data-view="fly" style="display:none">' +
      '<div class="fops"><select class="fsels" aria-label="' + T.flyTypesLabel + '"></select><button class="fload">' + T.flyLoadBtn + '</button></div>' +
      '<div class="fcanvas"><div class="fph"><span class="lbl"></span><span class="fsub"></span></div><div class="flybar" style="display:none"></div></div>' +
      '<div class="fstack">' + T.flyStack + '</div>' +
      '<div class="fmsgs"></div>' +
      '<div class="finput"><input type="text" placeholder="' + T.flyPlaceholder + '"><button aria-label="' + T.send + '">' + SVG_SEND + '</button></div>' +
      '</div>' +
      '</div>';
  }

  function safeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Акцентное форматирование email и телефонов внутри сообщения.
  function linkify(safe) {
    return safe
      .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a class="hl" href="mailto:$1">$1</a>')
      .replace(/(\+?\d[\d\s().-]{7,}\d)/g, function (m) {
        var digits = m.replace(/[^\d+]/g, '');
        if (digits.length < 9 || digits.length > 16) return m;
        return '<a class="hl" href="tel:' + digits + '">' + m + '</a>';
      });
  }

  function fmt(text) {
    return linkify(safeHtml(text)).replace(/\n/g, '<br>');
  }

  function addMsg(text, who, name) {
    var div = document.createElement('div');
    div.className = 'b ' + who;
    var html = '';
    if (who === 'bot') {
      html += '<div class="av">' + SVG_ICON + '</div>';
      html += '<div class="col" style="min-width:0"><div class="name">' + safeHtml(name || T.title) + '</div><div class="m">' + fmt(text) + '</div></div>';
    } else {
      html += '<div class="col" style="min-width:0"><div class="m">' + fmt(text) + '</div></div>';
    }
    div.innerHTML = html;
    msgEl.appendChild(div);
    msgEl.scrollTop = msgEl.scrollHeight;
    scheduleCheckin(who);
    return div;
  }

  // Кнопки быстрого ответа под сообщением бота.
  function addQuick(text, buttons, name) {
    var div = addMsg(text, 'bot', name);
    var box = document.createElement('div');
    box.className = 'quick';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        box.remove();
        b.onClick();
      });
      box.appendChild(btn);
    });
    div.querySelector('.col').appendChild(box);
    msgEl.scrollTop = msgEl.scrollHeight;
    return div;
  }

  function typing(on) {
    if (!on) { var d = msgEl.querySelector('.dots'); if (d) d.parentElement.parentElement.remove(); return; }
    var div = document.createElement('div');
    div.className = 'b bot';
    div.innerHTML = '<div class="av">' + SVG_ICON + '</div><div class="col"><div class="name">' + safeHtml(T.title) + '</div><div class="m dots"><span></span><span></span><span></span></div></div>';
    msgEl.appendChild(div);
    msgEl.scrollTop = msgEl.scrollHeight;
  }

  function pushChips() {
    var box = chipsEl.querySelector('[data-chips]');
    if (!box) return;
    var items = [];
    KNOW.forEach(function (item) { if (items.length < 3 && item.title && item.title !== 'Разделы сайта') items.push(item.title); });
    if (!items.length) items = [T.chips.replace('Популярные', ''), 'Доставка', 'Возврат'].filter(Boolean);
    box.innerHTML = items.map(function (t) { return '<button class="chip">' + safeHtml(t.length > 42 ? t.slice(0, 42) + '…' : t) + '</button>'; }).join('');
  }

  var AUDIO_OK = false, AUDIO_CTX = null;
  document.addEventListener('click', function () { AUDIO_OK = true; }, true);

  function beep() {
    if (!CONFIG.sound || !AUDIO_OK) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!AUDIO_CTX) AUDIO_CTX = new Ctx();
      var ctx = AUDIO_CTX;
      function tone(f, t0, dur) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.03);
      }
      var t = ctx.currentTime;
      tone(660, t, 0.13);
      tone(880, t + 0.12, 0.16);
    } catch (e) {}
  }

  function badgeEl() {
    var badge = shadow.querySelector('.ubadge');
    if (!badge) return null;
    return badge;
  }

  function notifyIncoming(text) {
    if (panelEl.classList.contains('open')) return;
    beep();
    CHAT.unread = (CHAT.unread || 0) + 1;
    var badge = badgeEl();
    if (badge) { badge.style.display = 'flex'; badge.textContent = CHAT.unread > 99 ? '99+' : CHAT.unread; }
    if (toggleBtn) toggleBtn.classList.add('new');
    if (teaserEl) {
      var t = String(text || '').split('\n')[0].slice(0, 120);
      teaserEl.innerHTML = safeHtml(t) + '<button class="x">✕</button>';
      teaserEl.style.display = 'block';
    }
  }

  function clearUnread() {
    CHAT.unread = 0;
    var badge = badgeEl();
    if (badge) badge.style.display = 'none';
    if (toggleBtn) toggleBtn.classList.remove('new');
  }

  function pushServerChips(items) {
    var box = chipsEl.querySelector('[data-chips]');
    if (!box || !items || !items.length) return;
    box.innerHTML = items.slice(0, 8).map(function (t) { return '<button class="chip">' + safeHtml(String(t).length > 42 ? String(t).slice(0, 42) + '…' : String(t)) + '</button>'; }).join('');
  }

  var CONFIG_MODE = '';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function statusOk(text, color) {
    var s = shadow.querySelector('.s');
    if (!s) return;
    s.textContent = text;
    if (color) s.style.color = color;
  }

  function renderServerMsg(m) {
    if (CHAT.seen[m.id]) return;
    CHAT.seen[m.id] = 1;
    addMsg(m.text, 'bot', m.from === 'agent' ? T.operator : T.title);
    notifyIncoming(m.text);
  }

  function skipEmail() {
    CONFIG_MODE = '';
    inputEl.value = '';
    inputEl.placeholder = T.input;
    addMsg(T.emailSkip, 'bot');
    if (CONFIG.backend && CHAT.id) initBackend();
  }

  function submitEmail(v) {
    v = String(v || '').trim();
    if (!v && CONFIG.askEmail === 'optional') { skipEmail(); return; }
    if (!EMAIL_RE.test(v)) { addMsg(T.emailBad, 'bot'); return; }
    CHAT.email = v.toLowerCase();
    LS.set('pw_email', CHAT.email);
    addMsg(v, 'user');
    inputEl.placeholder = T.input;
    CONFIG_MODE = '';
    addMsg(T.emailDone, 'bot');
    if (CONFIG.backend && CHAT.id) initBackend();
  }

  function askForEmail() {
    CONFIG_MODE = 'email';
    addMsg(T.emailAsk, 'bot');
    inputEl.placeholder = CONFIG.askEmail === 'optional' ? (I18N_EN ? 'you@example.com · Enter — skip' : 'you@example.com · Enter — пропустить') : 'you@example.com';
  }

  function backendAsk(q) {
    fetch(CONFIG.backend + '/api/chat/' + encodeURIComponent(CHAT.id) + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: q })
    }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (resp) {
      typing(false);
      (resp.messages || []).forEach(renderServerMsg);
      if (resp.mode === 'human' && !(resp.messages || []).length) addMsg(T.operatorWait, 'bot');
    }).catch(function () {
      typing(false);
      addMsg(T.fallback, 'bot');
    });
  }

  function offlineAsk(q) {
    aiAnswer(q).then(function (ai) {
      typing(false);
      setTimeout(function () {
        var t = ai || answerText(q).text;
        addMsg(t, 'bot');
        notifyIncoming(t);
      }, 220);
    });
  }

  function ask(q) {
    q = String(q || '').trim();
    if (CONFIG_MODE === 'email') { submitEmail(q); return; }
    if (!q) return;
    CHAT.userTurns++;
    addMsg(q, 'user');
    inputEl.value = '';
    typing(true);
    if (CONFIG.backend && CHAT.id) { CHAT.backendTurns++; backendAsk(q); }
    else offlineAsk(q);
  }

  function setHuman(on) {
    CHAT.human = !!on;
    if (host) {
      if (CHAT.human) host.setAttribute('data-human', '');
      else host.removeAttribute('data-human');
    }
    if (CHAT.human) cancelCheckin();
  }

  function applyOperators() {
    if (!host) return;
    if (CONFIG.operatorsEnabled === false) host.setAttribute('data-noop', '');
    else host.removeAttribute('data-noop');
  }

  function doHandoff() {
    if (CHAT.human) return;
    if (CONFIG.operatorsEnabled === false) {
      addMsg(T.operatorsOff, 'bot');
      notifyIncoming(T.operatorsOff);
      return;
    }
    if (!CONFIG.backend) {
      addMsg(T.offlineOperator + CONFIG.supportEmail, 'bot');
      return;
    }
    setHuman(true);
    addMsg(T.handoff, 'bot');
    fetch(CONFIG.backend + '/api/chat/' + encodeURIComponent(CHAT.id) + '/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .catch(function () { setHuman(false); addMsg(T.fallback, 'bot'); });
  }

  function doResume() {
    if (!CHAT.human) return;
    if (!CONFIG.backend) {
      setHuman(false);
      addMsg(T.resumeMsg, 'bot');
      return;
    }
    fetch(CONFIG.backend + '/api/chat/' + encodeURIComponent(CHAT.id) + '/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function () { setHuman(false); addMsg(T.resumeMsg, 'bot'); })
      .catch(function () { addMsg(T.fallback, 'bot'); });
  }

  function cancelCheckin() {
    if (CHAT.checkinT) { clearTimeout(CHAT.checkinT); CHAT.checkinT = null; }
  }

  // ИИ сам спрашивает «решён ли вопрос» после длительной паузы клиента.
  function scheduleCheckin(who) {
    if (!CONFIG.checkinAfter || CONFIG.checkinAfter <= 0 || CHAT.checkinDone || CHAT.checkinPending) return;
    if (who === 'user') { cancelCheckin(); return; }
    if (!CHAT.userTurns || CHAT.human || CHAT.closed) return;
    cancelCheckin();
    CHAT.checkinT = setTimeout(fireCheckin, CONFIG.checkinAfter * 1000);
  }

  function fireCheckin() {
    CHAT.checkinT = null;
    if (CHAT.human || CHAT.closed || CHAT.checkinDone || CHAT.checkinPending) return;
    if (document.hidden) { CHAT.checkinT = setTimeout(fireCheckin, Math.max(10, CONFIG.checkinAfter) * 1000); return; }
    CHAT.checkinPending = true;
    var q = T.checkinAsk;
    var div = addQuick(q, [
      { label: T.checkinYes, onClick: function () { resolveYes(); } },
      { label: T.checkinNo, onClick: function () { resolveNo(); } }
    ]);
    notifyIncoming(q);
    return div;
  }

  function postResolve() {
    if (!CONFIG.backend || !CHAT.id) return Promise.resolve();
    return fetch(CONFIG.backend + '/api/chat/' + encodeURIComponent(CHAT.id) + '/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).catch(function () {});
  }

  function resolveYes() {
    CHAT.checkinDone = true;
    CHAT.checkinPending = false;
    cancelCheckin();
    addMsg(T.checkinThanks, 'bot');
    var wantRating = CONFIG.backend && CHAT.id && !CHAT.rated;
    postResolve();
    if (wantRating) { CHAT.closing = true; showStarRating(); }
    else setTimeout(function () { panelEl.classList.remove('open'); }, 700);
  }

  function resolveNo() {
    if (CONFIG.operatorsEnabled === false) {
      addQuick(T.checkinNoMsg, [
        { label: T.continueBtn, onClick: function () { CHAT.checkinPending = false; cancelCheckin(); } }
      ]);
      notifyIncoming(T.checkinNoMsg);
      return;
    }
    addQuick(T.checkinNoMsg, [
      { label: T.operatorBtn, onClick: function () { CHAT.checkinPending = false; doHandoff(); } },
      { label: T.continueBtn, onClick: function () { CHAT.checkinPending = false; cancelCheckin(); } }
    ]);
    notifyIncoming(T.checkinNoMsg);
  }

  function connectSSE() {
    if (CHAT.es) { try { CHAT.es.close(); } catch (e) {} }
    try {
      var es = new EventSource(CONFIG.backend + '/api/chat/' + encodeURIComponent(CHAT.id) + '/events');
      CHAT.es = es;
      es.addEventListener('reply', function (e) { try { renderServerMsg(JSON.parse(e.data)); } catch (err) {} });
      es.addEventListener('mode', function (e) {
        try {
          var m = JSON.parse(e.data);
          if (m.mode === 'human') setHuman(true);
          else if (m.mode === 'ai') setHuman(false);
          else if (m.mode === 'closed') { CHAT.closed = true; setHuman(false); cancelCheckin(); statusOk(I18N_EN ? 'ticket closed' : 'тикет закрыт'); }
        } catch (err) {}
      });
    } catch (e) {}
  }

  function initBackend() {
    var payload = {
      chatId: CHAT.id,
      email: CHAT.email,
      siteName: CONFIG.siteName,
      page: location.href,
      knowledge: KNOW.map(function (i) { return { title: i.title, content: i.content }; }).slice(0, 80),
      prompt: systemPromptBase(''),
      instructions: CONFIG.instructions
    };
    fetch(CONFIG.backend + '/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (d) {
      if (d && d.operatorsEnabled !== undefined) {
        CONFIG.operatorsEnabled = !!d.operatorsEnabled;
        applyOperators();
      }
      if (d && d.flyEnabled !== undefined) {
        CONFIG.flyEnabled = !!d.flyEnabled;
        applyFly();
      }
      if (d && d.askEmail !== undefined) {
        CONFIG.askEmail = d.askEmail === true ? 'optional' : false;
      }
      try { LS.set('pw_cfg', JSON.stringify({ operatorsEnabled: !!CONFIG.operatorsEnabled, flyEnabled: !!CONFIG.flyEnabled })); } catch (e) {}
      connectSSE();
      statusOk('чат подключён · поддержка', '#4ade80');
      fetch(CONFIG.backend + '/api/faq').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
        if (d && d.items && d.items.length) pushServerChips(d.items.map(function (i) { return i.q; }));
      }).catch(function () {});
    }).catch(function () {
      statusOk('сервер чата недоступен', '#f87171');
    });
  }

  function showStarRating() {
    var div = document.createElement('div');
    div.className = 'b bot';
    div.innerHTML = '<div class="av">' + SVG_ICON + '</div><div class="col"><div class="name">' + safeHtml(T.title) + '</div><div class="stars"><div class="lbl">' + safeHtml(T.ratingAsk) + '</div><button data-star="1">★</button><button data-star="2">★</button><button data-star="3">★</button><button data-star="4">★</button><button data-star="5">★</button></div></div>';
    msgEl.appendChild(div);
    msgEl.scrollTop = msgEl.scrollHeight;
    Array.prototype.forEach.call(div.querySelectorAll('[data-star]'), function (b) {
      b.addEventListener('click', function () {
        var score = Number(b.getAttribute('data-star'));
        CHAT.rated = true;
        fetch(CONFIG.backend + '/api/chat/' + encodeURIComponent(CHAT.id) + '/rating', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: score })
        }).catch(function () {});
        addMsg(T.ratingDone, 'bot');
        CHAT.closing = false;
        panelEl.classList.remove('open');
      });
    });
  }

  function tryClose() {
    var wantRating = CONFIG.backend && CHAT.id && CHAT.backendTurns > 0 && !CHAT.rated && !CHAT.closing;
    if (wantRating) {
      CHAT.closing = true;
      showStarRating();
      return;
    }
    panelEl.classList.remove('open');
  }

  function applyFly() {
    if (!host) return;
    if (CONFIG.flyEnabled === false) host.setAttribute('data-nofly', '');
    else host.removeAttribute('data-nofly');
  }

  function cacheFlags() {
    try {
      var c = LS.get('pw_cfg');
      if (!c) return;
      var o = JSON.parse(c);
      if (o && typeof o === 'object') {
        if (o.operatorsEnabled !== undefined) CONFIG.operatorsEnabled = !!o.operatorsEnabled;
        if (o.flyEnabled !== undefined) CONFIG.flyEnabled = !!o.flyEnabled;
      }
    } catch (e) {}
  }

  // Применяет предустановки внешнего вида из /api/flags (если авто-адаптация выключена).
  function applyStyleFromFlags(d) {
    if (!d || typeof d !== 'object') return;
    var changed = false;
    if (d.autoAdaptStyle === false) {
      if (typeof d.primary === 'string' && d.primary && d.primary !== PALETTE.primary) { PALETTE.primary = d.primary; changed = true; }
      if (typeof d.accent === 'string' && d.accent && d.accent !== PALETTE.accent) { PALETTE.accent = d.accent; changed = true; }
      if (typeof d.bg === 'string' && d.bg && d.bg !== PALETTE.bg) {
        PALETTE.bg = d.bg;
        PALETTE.dark = luminance(PALETTE.bg) < 0.45;
        PALETTE.fg = PALETTE.dark ? '#f3f4f6' : '#111827';
        changed = true;
      }
    }
    if (d.autoAdaptFont === false && typeof d.font === 'string' && d.font && d.font !== PALETTE.font) { PALETTE.font = d.font; changed = true; }
    if (changed && host && shadow) applyPalette();
  }

  // Сервер поддержки — источник истины для настроек. Локальный кэш используется
  // только как офлайн-фолбэк, когда сервер недоступен.
  function syncFlags() {
    if (!CONFIG.backend) { cacheFlags(); applyOperators(); applyFly(); return; }
    fetch(CONFIG.backend + '/api/flags', { method: 'GET', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (d) {
      if (!d || typeof d !== 'object') throw new Error();
      if (d.operatorsEnabled !== undefined) CONFIG.operatorsEnabled = !!d.operatorsEnabled;
      if (d.flyEnabled !== undefined) CONFIG.flyEnabled = !!d.flyEnabled;
      if (d.askEmail !== undefined) CONFIG.askEmail = d.askEmail === true ? 'optional' : false;
      applyStyleFromFlags(d);
      applyOperators();
      applyFly();
      try { LS.set('pw_cfg', JSON.stringify({ operatorsEnabled: !!CONFIG.operatorsEnabled, flyEnabled: !!CONFIG.flyEnabled })); } catch (e) {}
    }).catch(function () {
      cacheFlags();
      applyOperators();
      applyFly();
    });
  }

  var fmsgEl = null, fcanvasEl = null, fopsSelect = null, fopsLoad = null, finpEl = null, fphLbl = null, fphSub = null;
  var FLY = { loaded: false, threeP: null };

  function addFlyMsg(text, who) {
    var div = document.createElement('div');
    div.className = 'b ' + (who === 'user' ? 'user' : 'bot');
    var html;
    if (who === 'user') {
      html = '<div class="col" style="min-width:0"><div class="m">' + fmt(text) + '</div></div>';
    } else {
      html = '<div class="av">' + SVG_ICON + '</div><div class="col" style="min-width:0"><div class="name">Fly · connectome</div><div class="m">' + fmt(text) + '</div></div>';
    }
    div.innerHTML = html;
    fmsgEl.appendChild(div);
    fmsgEl.scrollTop = fmsgEl.scrollHeight;
  }

  function flyTyping(on) {
    var d = fmsgEl.querySelector('.dots');
    if (!on) {
      if (d) { var b = d.closest('.b'); if (b) b.remove(); }
      return;
    }
    var div = document.createElement('div');
    div.className = 'b bot';
    div.innerHTML = '<div class="av">' + SVG_ICON + '</div><div class="col"><div class="name">Fly · connectome</div><div class="m dots"><span></span><span></span><span></span></div></div>';
    fmsgEl.appendChild(div);
    fmsgEl.scrollTop = fmsgEl.scrollHeight;
  }

  function flyAsk(q) {
    q = String(q || '').trim();
    if (!q) return;
    addFlyMsg(q, 'user');
    finpEl.value = '';
    if (!CONFIG.backend) { addFlyMsg(T.flyNeedServer, 'bot'); return; }
    flyTyping(true);
    fetch(CONFIG.backend + '/api/fly/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: q })
    }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (d) {
      flyTyping(false);
      addFlyMsg(d && d.text ? d.text : T.flyFail8, 'bot');
    }).catch(function () {
      flyTyping(false);
      addFlyMsg(T.flyFail8, 'bot');
    });
  }

  function setPh(label, sub) {
    if (fphLbl) fphLbl.textContent = label || '';
    if (fphSub) fphSub.textContent = sub || '';
  }

  function openFly() {
    if (FLY.loaded) return;
    FLY.loaded = true;
    addFlyMsg(T.flyGreeting, 'bot');
    loadFlyOptions();
  }

  function loadFlyOptions() {
    if (!fopsSelect || fopsSelect.options.length) return;
    if (!CONFIG.backend) { setPh('', T.flyNeedServer); return; }
    fetch(CONFIG.backend + '/api/fly/neurons').then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (d) {
      if (!d || !d.items || !d.items.length) return;
      fopsSelect.innerHTML = d.items.map(function (it) {
        return '<option value="' + safeHtml(it.id) + '">' + safeHtml(it.type) + '</option>';
      }).join('');
      if (CONFIG.backend) loadFlyNeuron(fopsSelect.value);
    }).catch(function () {});
  }

  function loadThree() {
    if (FLY.threeP) return FLY.threeP;
    FLY.threeP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CONFIG.flyThreeUrl;
      var to = setTimeout(function () { s.remove(); reject(new Error('timeout')); }, 9000);
      s.onload = function () { clearTimeout(to); resolve(window.THREE); };
      s.onerror = function () { clearTimeout(to); reject(new Error('load fail')); };
      document.head.appendChild(s);
    });
    return FLY.threeP;
  }

  function loadFlyNeuron(id) {
    if (!id) return;
    if (!CONFIG.backend) { setPh('', T.flyNeedServer); return; }
    setPh(T.flyViewerLoad, id);
    fetch(CONFIG.backend + '/api/fly/neuron/' + encodeURIComponent(id))
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        loadThree().then(function (THREE) { drawFlyNeuron(THREE, data); })
          .catch(function () { setPh('', T.flyViewerFail); });
      })
      .catch(function () { setPh('', T.flyFail8); });
  }

  function drawFlyNeuron(THREE, data) {
    try {
      if (!THREE || !THREE.WebGLRenderer) throw new Error('no three');
      fcanvasEl.innerHTML = '';
      var canvas = document.createElement('canvas');
      fcanvasEl.appendChild(canvas);
      var w = fcanvasEl.clientWidth || 320;
      var h = fcanvasEl.clientHeight || 185;
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0x10141c);
      var cam = new THREE.PerspectiveCamera(50, w / Math.max(1, h), 0.1, 5000);
      var pts = data.points || { x: [], y: [], z: [] };
      var n = Math.min(pts.x.length, pts.y.length, pts.z.length);
      var arr = [];
      for (var i = 0; i < n; i++) arr.push(pts.x[i], pts.y[i], pts.z[i]);
      if (arr.length < 3) throw new Error('no points');
      var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (var j = 0; j < arr.length; j += 3) {
        for (var k = 0; k < 3; k++) {
          if (arr[j + k] < min[k]) min[k] = arr[j + k];
          if (arr[j + k] > max[k]) max[k] = arr[j + k];
        }
      }
      var cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
      var span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);
      var s = 70 / span;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      var g = new THREE.Group();
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x38bdf8, size: 1.15, sizeAttenuation: true })));
      g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.5 })));
      g.scale.set(s, s, s);
      g.position.set(-cx * s, -cy * s, -cz * s);
      scene.add(g);
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      var dir = new THREE.DirectionalLight(0xffffff, 0.6);
      dir.position.set(60, 80, 40);
      scene.add(dir);
      var rx = -0.35, ry = 0.4, zoom = 1;
      function applyCam() {
        cam.position.set(0, 0, 130 / zoom);
        cam.rotation.set(rx, ry, 0, 'YXZ');
      }
      applyCam();
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        zoom = Math.max(0.4, Math.min(6, zoom * (e.deltaY > 0 ? 1.08 : 0.92)));
        applyCam();
      }, { passive: false });
      var drag = null;
      canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
      canvas.addEventListener('pointermove', function (e) {
        if (!drag) return;
        ry += (e.clientX - drag.x) * 0.01;
        rx += (e.clientY - drag.y) * 0.01;
        rx = Math.max(-1.5, Math.min(1.5, rx));
        drag = { x: e.clientX, y: e.clientY };
        applyCam();
      });
      canvas.addEventListener('pointerup', function () { drag = null; });
      canvas.addEventListener('pointercancel', function () { drag = null; });
      (function loop() {
        renderer.render(scene, cam);
        if (fcanvasEl.contains(canvas)) requestAnimationFrame(loop);
      })();
      setPh(data.demo ? T.flyViewerDemo : T.flyViewerOk, data.type ? data.type + ' · ' + (data.nodeCount || 0) + ' n' : '');
    } catch (err) {
      setPh('', T.flyViewerFail);
    }
  }

  function switchTab(name) {
    var tabs = shadow.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === name); });
    var chatV = shadow.querySelector('.viewp[data-view="chat"]');
    var flyV = shadow.querySelector('.viewp[data-view="fly"]');
    if (chatV) chatV.style.display = name === 'chat' ? '' : 'none';
    if (flyV) flyV.style.display = name === 'fly' ? '' : 'none';
    if (name === 'fly') openFly();
  }

  function wire() {
    toggleBtn = shadow.querySelector('.fab');
    teaserEl = shadow.querySelector('.teaser');
    panelEl = shadow.querySelector('.panel');
    msgEl = shadow.querySelector('.msgs');
    chipsEl = shadow.querySelector('.chips');
    inputEl = shadow.querySelector('.input input');
    sendBtn = shadow.querySelector('.input button');

    toggleBtn.addEventListener('click', toggle);
    shadow.querySelector('.close').addEventListener('click', tryClose);
    teaserEl.addEventListener('click', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('x')) { e.stopPropagation(); teaserEl.style.display = 'none'; return; }
      teaserEl.style.display = 'none';
      toggle();
    });
    sendBtn.addEventListener('click', function () { ask(inputEl.value); });
    inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(inputEl.value); });
    chipsEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (chip) ask(chip.textContent);
    });
    var tabBtns = shadow.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabBtns, function (t) { t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); }); });
    fmsgEl = shadow.querySelector('.fmsgs');
    fcanvasEl = shadow.querySelector('.fcanvas');
    fopsSelect = shadow.querySelector('.fsels');
    fopsLoad = shadow.querySelector('.fload');
    finpEl = shadow.querySelector('.finput input');
    var fsend = shadow.querySelector('.finput button');
    fphLbl = shadow.querySelector('.fph .lbl');
    fphSub = shadow.querySelector('.fph .fsub');
    if (fsend) fsend.addEventListener('click', function () { flyAsk(finpEl.value); });
    if (finpEl) finpEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') flyAsk(finpEl.value); });
    if (fopsSelect) fopsSelect.addEventListener('change', function () { loadFlyNeuron(fopsSelect.value); });
    if (fopsLoad) fopsLoad.addEventListener('click', function () { if (fopsSelect && fopsSelect.value) loadFlyNeuron(fopsSelect.value); });
    var opBtn = shadow.querySelector('[data-op]');
    if (opBtn) opBtn.addEventListener('click', doHandoff);
    var aiBtn = shadow.querySelector('[data-ai]');
    if (aiBtn) aiBtn.addEventListener('click', doResume);
    addMsg((I18N_EN ? 'Hi! I am ' : 'Привет! ') + CONFIG.siteName + (I18N_EN ? '. Ask me about products, delivery or returns — I answer with real data from this site.' : '. Спросите меня о товарах, доставке или возврате — я отвечаю данными этого сайта.'), 'bot');
    if (CONFIG.aiEnabled || CONFIG.backend) checkAI();
    if (CONFIG.backend) {
      if (!CHAT.id) CHAT.id = 'c_' + Math.random().toString(36).slice(2, 10);
      if (!CHAT.email && CONFIG.askEmail) CONFIG_MODE = 'pending-email';
      else initBackend();
    } else if (CONFIG.askEmail && !CHAT.email) {
      CONFIG_MODE = 'pending-email';
    }
  }

  function checkAI() {
    var statusEl = shadow.querySelector('.s');
    if (!statusEl) return;
    if (CONFIG.backend) {
      statusEl.textContent = 'подключаюсь...';
      fetch(CONFIG.backend + '/api/health').then(function (r) {
        if (!r.ok) throw new Error();
        statusEl.textContent = 'поддержка онлайн';
        statusEl.style.color = '#4ade80';
      }).catch(function () {
        statusEl.textContent = 'сервер чата недоступен';
        statusEl.style.color = '#f87171';
      });
      return;
    }
    if (BACKEND.provider !== 'ollama') {
      if (!CONFIG.apiKey) {
        statusEl.textContent = 'AI: ' + BACKEND.label + ' — нужен apiKey';
        statusEl.style.color = '#fbbf24';
      } else {
        statusEl.textContent = 'AI: ' + BACKEND.model + ' · ' + BACKEND.label;
        statusEl.style.color = '#4ade80';
      }
      return;
    }
    statusEl.textContent = 'проверяю AI...';
    fetch(BACKEND.endpoint.replace('/chat/completions', '/../api/tags'), { method: 'GET' }).then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (data) {
      var models = (data.models || []).map(function (m) { return m.name; });
      var found = models.some(function (n) { return n.indexOf(BACKEND.model.split(':')[0]) === 0; });
      if (found) {
        statusEl.textContent = 'AI: ' + BACKEND.model + ' · Ollama';
        statusEl.style.color = '#4ade80';
      } else {
        statusEl.textContent = 'AI: нужна модель ' + BACKEND.model;
        statusEl.style.color = '#fbbf24';
      }
    }).catch(function () {
      statusEl.textContent = 'ИИ отключён · отвечаю по данным сайта';
      statusEl.style.color = '#fbbf24';
    });
  }

  function toggle() {
    if (panelEl.classList.contains('open')) panelEl.classList.remove('open');
    else {
      panelEl.classList.add('open');
      clearUnread();
      if (CONFIG_MODE === 'pending-email') { CONFIG_MODE = ''; askForEmail(); }
    }
  }

  function paint() {
    var st = shadow && shadow.querySelector('style');
    if (st) st.textContent = cssText();
  }

  function updateDebug() {
    try {
      window.__ADAPTIVE_DEBUG__ = {
        palette: { primary: PALETTE.primary, accent: PALETTE.accent, bg: PALETTE.bg, fg: PALETTE.fg, dark: PALETTE.dark, radius: PALETTE.radius, font: PALETTE.font, logo: PALETTE.logo, found: PALETTE.found, ai: !!PALETTE._ai },
        knowledge: KNOW.slice(0, 40).map(function (i) { return i.title + ' :: ' + i.content.slice(0, 120); }),
        knowCount: KNOW.length,
        imagesCount: IMAGE_LIST.length,
        backend: { provider: BACKEND.provider, label: BACKEND.label, endpoint: BACKEND.endpoint, model: BACKEND.model }
      };
    } catch (e) {}
  }

  function applyPalette() {
    if (!host || !shadow) return;
    host.style.setProperty('--pw-font', JSON.stringify(PALETTE.font));
    host.style.setProperty('--pw-ad', computeFontAdapt());
    paint();
    host.setAttribute('data-theme-anim', '');
    clearTimeout(host._animT);
    host._animT = setTimeout(function () { host.removeAttribute('data-theme-anim'); }, 600);
    updateDebug();
  }

  // Автомасштабирование виджета под текущий размер окна (учитывает мобильные панели браузера).
  function applyViewport() {
    if (!host) return;
    var vv = window.visualViewport;
    var vh = (vv && vv.height) || window.innerHeight || 0;
    var vw = (vv && vv.width) || window.innerWidth || 0;
    if (vh) host.style.setProperty('--pw-vh', vh + 'px');
    if (vw) host.style.setProperty('--pw-vw', vw + 'px');
  }

  function bindViewport() {
    if (vpBound) return;
    vpBound = true;
    var on = function () { applyViewport(); };
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', on);
    applyViewport();
  }

  // Перечитать стиль и знания страницы и плавно перекрасить виджет без перезагрузки.
  function refreshTheme() {
    extractStyle();
    applyViewport();
    KNOW = [];
    IMAGE_LIST = [];
    IDX = {};
    buildKnowledge();
    indexKnowledge();
    applyPalette();
  }

  function buildUI() {
    host = document.createElement('div');
    host.setAttribute('data-adaptive-widget', '');
    host.style.cssText = 'position:static;z-index:auto;all:initial;';
    document.body.appendChild(host);
    bindViewport();
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>' + cssText() + '</style>' + markup();
    host.style.setProperty('--pw-font', JSON.stringify(PALETTE.font));
    host.style.setProperty('--pw-ad', computeFontAdapt());
    applyOperators();
    applyFly();
    wire();
    pushChips();
    if (CONFIG.autoOpen || CONFIG.teaser) {
      setTimeout(function () {
        if (!panelEl.classList.contains('open')) teaserEl.style.display = 'block';
      }, 1600);
    }
    updateDebug();
  }

  window.AdaptiveWidget = {
    refresh: refreshTheme,
    palette: function () {
      return { primary: PALETTE.primary, accent: PALETTE.accent, bg: PALETTE.bg, dark: PALETTE.dark, radius: PALETTE.radius, font: PALETTE.font };
    },
    open: function () { if (panelEl && !panelEl.classList.contains('open')) toggle(); },
    close: function () { if (panelEl && panelEl.classList.contains('open')) toggle(); },
    toggle: toggle
  };

  function boot() {
    extractStyle();
    buildKnowledge();
    indexKnowledge();
    if (CONFIG.vision) maybeDescribeImages();
    if (CONFIG.aiStyle && !PALETTE.found) {
      aiSuggestStyle();
      return;
    }
    buildUI();
    syncFlags();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();