/* ==========================================================================
   Адвокат Зубрицкий Д. С. — скрипты сайта
   --------------------------------------------------------------------------
   Исходник. Правим только этот файл; на сайт подключается js/main.min.js,
   его собирает build.sh.
   Сайт полностью работает без JS: всё здесь — надстройка над готовой
   разметкой (progressive enhancement). Ни одна функция не создаёт контент,
   без которого страница была бы неполной.
   ========================================================================== */

'use strict';

/* Всё обёрнуто в IIFE: имена не попадают в глобальную область, а terser
   может сокращать их при минификации (глобальные имена он не трогает,
   потому что их могли бы использовать другие скрипты). */
(function () {
  /**
   * Контакты — ЕДИНСТВЕННЫЙ источник истины для разметки.
   * Элементы с data-site получают значения отсюда (см. initContacts).
   * В HTML те же значения записаны как запасной вариант для работы без JS,
   * а в JSON-LD — для поисковиков; при смене контакта обновите и их.
   */
  const SITE = Object.freeze({
    phone: '+79111255559',
    phoneText: '+7 (911) 125-55-59',
    whatsapp: 'https://wa.me/79111255559',
    telegram: 'https://t.me/zDmitryS',
    telegramText: '@zDmitryS',
    email: 'advokat.zubritskiy@gmail.com'
  });

  const root = document.documentElement;

  /* MediaQueryList, а не разовое значение: .matches читается в момент действия,
     поэтому переключение настройки в системе подхватывается без перезагрузки. */
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const supportsObserver = 'IntersectionObserver' in window;


  /* ----- Хелперы ----- */

  /**
   * Троттлинг через requestAnimationFrame: сколько бы событий scroll/resize
   * ни пришло за кадр, fn выполнится не чаще одного раза — ровно перед
   * отрисовкой, когда чтение размеров не вызывает лишних перерасчётов раскладки.
   */
  function onFrame(fn) {
    let scheduled = false;

    return function () {
      if (scheduled) return;
      scheduled = true;

      window.requestAnimationFrame(function () {
        scheduled = false;
        fn();
      });
    };
  }


  /* ----- Контакты из SITE ----- */

  function initContacts() {
    const apply = {
      'phone-link': function (el) { el.href = 'tel:' + SITE.phone; },
      'phone-text': function (el) { el.textContent = SITE.phoneText; },
      'whatsapp-link': function (el) { el.href = SITE.whatsapp; },
      'telegram-link': function (el) { el.href = SITE.telegram; },
      'telegram-text': function (el) { el.textContent = SITE.telegramText; },
      'email-link': function (el) { el.href = 'mailto:' + SITE.email; },
      'email-text': function (el) { el.textContent = SITE.email; }
    };

    document.querySelectorAll('[data-site]').forEach(function (el) {
      const setter = apply[el.dataset.site];
      if (setter) setter(el);
    });
  }


  /* ----- Шапка: фон при прокрутке, скрытие вниз / появление вверх ----- */

  /**
   * Возвращает небольшой API для других модулей: высоту шапки (для якорей)
   * и pin() — временный запрет скрывать шапку, пока идёт программная прокрутка
   * к разделу (иначе шапка «уезжала» бы при каждом клике по меню).
   */
  function initHeader() {
    const header = document.querySelector('[data-header]');

    if (!header) {
      return { height: function () { return 0; }, pin: function () {} };
    }

    const SOLID_AFTER = 8;     // px от верха — шапка получает фон
    const HIDE_AFTER = 320;    // выше этой отметки шапку не прячем никогда
    const DELTA = 8;           // мёртвая зона: мелкая дрожь пальца не дёргает шапку

    /* Фон шапки — через IntersectionObserver за невидимым «маячком» высотой
       SOLID_AFTER у самого верха страницы: ушёл из вида — значит, прокрутили.
       Так при загрузке не нужно читать scrollY: в Chrome это принудительный
       перерасчёт раскладки всей страницы ещё до первой отрисовки. И состояние
       верно сразу, даже если страница открылась на якоре (#contacts) или браузер
       восстановил прокрутку при перезагрузке — без единого события scroll. */
    if ('IntersectionObserver' in window) {
      const sentinel = document.createElement('div');
      sentinel.className = 'header-sentinel';
      sentinel.style.height = SOLID_AFTER + 'px';
      sentinel.setAttribute('aria-hidden', 'true');
      document.body.prepend(sentinel);

      new IntersectionObserver(function (entries) {
        header.classList.toggle('header--solid', !entries[entries.length - 1].isIntersecting);
      }).observe(sentinel);
    } else {
      header.classList.add('header--solid');
    }

    /* -1 — «ещё не измеряли»: первое значение берём из первого же события scroll. */
    let lastY = -1;
    let pinnedUntil = 0;

    const update = onFrame(function () {
      // В iOS при «резиновом» отскоке scrollY бывает отрицательным
      const y = Math.max(window.scrollY, 0);

      if (lastY < 0) {
        lastY = y;
        return;
      }

      const delta = y - lastY;
      if (Math.abs(delta) < DELTA) return;

      const locked = root.classList.contains('is-menu-open') || performance.now() < pinnedUntil;
      header.classList.toggle('header--hidden', delta > 0 && y > HIDE_AFTER && !locked);
      lastY = y;
    });

    window.addEventListener('scroll', update, { passive: true });

    return {
      height: function () {
        return header.offsetHeight;   // offsetHeight не зависит от transform — верно и для скрытой шапки
      },
      pin: function (ms) {
        pinnedUntil = performance.now() + ms;
        header.classList.remove('header--hidden');
      }
    };
  }


  /* ----- Подсветка активного пункта меню ----- */

  function initScrollSpy() {
    const links = Array.prototype.slice.call(document.querySelectorAll('[data-spy]'));
    if (!links.length || !supportsObserver) return;

    const linkById = new Map();
    links.forEach(function (link) {
      linkById.set(decodeURIComponent(link.hash.slice(1)), link);
    });

    let current = null;

    function setActive(link) {
      if (link === current) return;

      if (current) {
        current.classList.remove('nav__link--active');
        current.removeAttribute('aria-current');
      }
      if (link) {
        link.classList.add('nav__link--active');
        link.setAttribute('aria-current', 'true');
      }
      current = link;
    }

    /* Наблюдаем за всеми секциями, а не только за теми, что есть в меню:
       в «Практике» или «Проверке» подсветка должна сниматься.
       rootMargin оставляет тонкую горизонтальную полосу у середины экрана:
       активна секция, которая её пересекает, — секции идут без зазоров,
       поэтому в каждый момент такая секция ровно одна. */
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(linkById.get(entry.target.id) || null);
      });
    }, { rootMargin: '-45% 0px -54% 0px' });

    document.querySelectorAll('main section[id]').forEach(function (section) {
      observer.observe(section);
    });
  }


  /* ----- Мобильное меню ----- */

  function initMenu() {
    const toggle = document.querySelector('[data-menu-toggle]');
    const menu = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    if (!menu) return;

    const desktop = window.matchMedia('(min-width: 64em)');
    // Всё за пределами шапки на время открытого меню становится inert:
    // Tab не уходит под меню, а скринридер не читает скрытую за ним страницу.
    const outside = document.querySelectorAll('main, footer, [data-mobile-bar]');
    let isOpen = false;

    function setOpen(open) {
      if (open === isOpen) return;
      isOpen = open;

      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('menu--open', open);
      root.classList.toggle('is-menu-open', open);   // CSS: блок прокрутки, сплошная шапка, скрытая панель

      outside.forEach(function (el) {
        el.inert = open;
      });
    }

    toggle.addEventListener('click', function () {
      setOpen(!isOpen);
    });

    // Клик по пункту закрывает меню; дальше плавную прокрутку делает initSmoothScroll —
    // её обработчик висит на document и сработает после этого (всплытие).
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen) {
        setOpen(false);
        toggle.focus();   // фокус возвращается туда, откуда меню открыли
      }
    });

    // Повернули планшет или расширили окно до десктопа — мобильное меню не должно
    // остаться открытым вместе с блокировкой прокрутки.
    desktop.addEventListener('change', function (event) {
      if (event.matches) setOpen(false);
    });
  }


  /* ----- Плавная прокрутка по якорям ----- */

  function initSmoothScroll(header) {
    const PIN_MS = 1500;   // с запасом на самую длинную плавную прокрутку

    // Один делегированный обработчик на документ вместо обработчика на каждой ссылке
    document.addEventListener('click', function (event) {
      // Ctrl/Cmd/Shift-клик и средняя кнопка — пользователь хочет новую вкладку, не мешаем
      if (event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const id = decodeURIComponent(link.hash.slice(1));
      const target = id && document.getElementById(id);
      if (!target) return;

      event.preventDefault();

      // Секции ниже первого экрана рендерятся лениво (content-visibility: auto),
      // и до показа их высота — лишь оценка: позиция цели «плыла» бы, пока
      // промежуточные секции дорисовываются по ходу прокрутки. Перед первым
      // переходом включаем полный рендер — один раз, дальше класс уже стоит.
      root.classList.add('is-fully-rendered');

      // К первому экрану — ровно в 0, к остальным — с поправкой на реальную высоту шапки
      // (её высота различается на мобильном и десктопе, поэтому меряем, а не хардкодим).
      const top = id === 'top'
        ? 0
        : target.getBoundingClientRect().top + window.scrollY - header.height();

      header.pin(PIN_MS);
      if ('onscrollend' in window) {
        // Где есть scrollend, отпускаем шапку сразу по окончании прокрутки
        window.addEventListener('scrollend', function () { header.pin(150); }, { once: true });
      }

      window.scrollTo({
        top: Math.max(top, 0),
        behavior: reducedMotion.matches ? 'auto' : 'smooth'
      });

      // Адрес обновляем без прыжка — ссылкой на раздел можно поделиться
      if (window.location.hash !== '#' + id) {
        window.history.pushState(null, '', '#' + id);
      }

      // Переносим фокус: следующий Tab и скринридер продолжат с выбранного раздела.
      // preventScroll — иначе браузер мгновенно прыгнул бы к элементу и сорвал анимацию.
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }


  /* ----- Яндекс-карта по подходу к блоку ----- */

  function initMap() {
    const box = document.querySelector('[data-map]');
    if (!box || !box.dataset.src) return;

    function load() {
      const frame = document.createElement('iframe');
      frame.className = 'map__frame';
      frame.src = box.dataset.src;
      frame.title = box.dataset.title || 'Карта';
      frame.setAttribute('allowfullscreen', '');
      frame.addEventListener('load', function () {
        box.classList.add('map--loaded');
      }, { once: true });
      box.appendChild(frame);
    }

    if (!supportsObserver) {
      load();
      return;
    }

    /* Запас 600 px: к моменту, когда блок окажется на экране, виджет уже
       успеет загрузиться, но на первом экране запросов к Яндексу нет. */
    const observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: '600px 0px' });

    observer.observe(box);
  }


  /* ----- Мобильная панель: прячется при клавиатуре и на первом экране ----- */

  function initMobileBar() {
    const bar = document.querySelector('[data-mobile-bar]');
    if (!bar) return;

    const KEYBOARD_MIN = 150;   // px; меньше — это панель браузера, а не клавиатура

    const state = { keyboard: false, editing: false, heroVisible: false };

    function render() {
      bar.classList.toggle('mobile-bar--visible', !(state.keyboard || state.editing || state.heroVisible));
    }

    /* Основной сигнал — visualViewport: экранная клавиатура уменьшает видимую
       область, но не layout viewport (window.innerHeight). Умножение на scale
       отсекает pinch-zoom: при увеличении видимая область тоже «сжимается»,
       но vv.height × scale остаётся равным высоте окна. */
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', onFrame(function () {
        state.keyboard = window.innerHeight - vv.height * vv.scale > KEYBOARD_MIN;
        render();
      }));
    }

    /* Запасной сигнал — фокус в поле ввода: часть браузеров (например, Firefox
       на Android) при клавиатуре сжимает весь layout viewport, и разница высот
       остаётся нулевой. Форм на сайте сейчас нет, но поиск по странице и любое
       будущее поле не должны оказаться под панелью. */
    function isEditable(el) {
      return el instanceof Element &&
        el.matches('input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"]');
    }

    document.addEventListener('focusin', function (event) {
      if (isEditable(event.target)) { state.editing = true; render(); }
    });
    document.addEventListener('focusout', function (event) {
      if (isEditable(event.target)) { state.editing = false; render(); }
    });

    /* Пока видны кнопки первого экрана, панель с теми же тремя кнопками
       только дублировала бы их. До первого ответа observer’а считаем, что
       кнопки видны (панель и так скрыта стилями): синхронный замер через
       getBoundingClientRect здесь заставил бы браузер посчитать раскладку
       всей страницы прямо в DOMContentLoaded — до первой отрисовки. */
    const heroActions = document.querySelector('[data-hero-actions]');
    if (heroActions && supportsObserver) {
      state.heroVisible = true;

      new IntersectionObserver(function (entries) {
        state.heroVisible = entries[entries.length - 1].isIntersecting;
        render();
      }).observe(heroActions);
    }

    render();
  }


  /* ----- Запуск ----- */

  /* Скрипт подключён с defer, поэтому к моменту выполнения DOM уже разобран,
     а DOMContentLoaded ещё не наступил. Единая точка входа — так проще видеть
     порядок инициализации и зависимости между модулями. */
  document.addEventListener('DOMContentLoaded', function () {
    initContacts();
    const header = initHeader();
    initScrollSpy();
    initMenu();
    initSmoothScroll(header);
    initMap();
    initMobileBar();

    // Всё инициализировано — отключаем CSS-страховку (failsafe-show) для скрытых блоков
    root.classList.add('is-ready');

    // Каскад первого экрана ([data-intro]): двойной rAF нужен, чтобы кадр
    // со стартовым состоянием был уже отрисован, — иначе переход не проиграется.
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        root.classList.add('is-loaded');
      });
    });
  });
})();
