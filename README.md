# Образовательный сайт с панелью управления

Flask + SQLite + Vanilla JS. Без внешних JS-библиотек.

## Быстрый старт

### 1. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 2. Запуск

```bash
python app.py
```

Сайт откроется на http://localhost:5000

### 3. Вход в панель управления

Перейдите на http://localhost:5000/admin

- Логин: `admin`
- Пароль: `admin123`

**Смените пароль после первого входа** через кнопку "Сменить пароль" в боковом меню.

---

## Структура проекта

```
project/
├── app.py              # Flask backend + все API (robots.txt и sitemap.xml генерируются здесь)
├── requirements.txt
├── database.db         # SQLite (создаётся автоматически)
├── .secret_key         # Секретный ключ сессий (создаётся автоматически)
├── uploads/            # Загруженные изображения
├── tools/
│   └── screenshots/    # Dev-инструмент (Playwright) — вне публичной раздачи
└── static/
    ├── index.html      # Главная
    ├── courses.html    # Курсы
    ├── projects.html   # Мероприятия и лекции
    ├── materials.html  # Учебные материалы
    ├── blog.html       # Блог
    ├── news.html       # Новости
    ├── photos.html     # Фотогалерея
    ├── reviews.html    # Отзывы
    ├── faq.html        # FAQ
    ├── robots.txt
    ├── admin/
    │   ├── index.html      # Вход в панель
    │   └── dashboard.html  # Панель управления
    ├── icons/          # Логотип, favicon, OG-картинка, иконки контактов
    ├── css/
    │   ├── style.css   # Стили сайта
    │   └── admin.css   # Стили панели
    └── js/
        ├── api.js          # Общие утилиты
        ├── main.js         # Главная страница
        ├── courses.js
        ├── projects.js
        ├── materials.js
        ├── blog.js
        ├── news.js
        ├── photos.js
        ├── reviews.js
        ├── faq.js
        ├── contact-fab.js  # Плавающая кнопка контактов
        ├── copy-contact.js # Копирование контактов
        ├── admin-login.js  # Логика входа в панель
        └── admin.js        # Вся логика панели управления
```

---

## Страницы сайта

| URL | Описание |
|-----|----------|
| `/` | Главная: преподаватель, курсы-превью, форма обратной связи |
| `/courses` | Все курсы с формой записи |
| `/projects` | Мероприятия и открытые лекции с записью |
| `/materials` | Учебные материалы: задачи и разборы |
| `/blog` | Блог: статьи по лингвистике |
| `/news` | Новости (старше 60 дней удаляются автоматически) |
| `/photos` | Фотогалерея занятий и мероприятий |
| `/reviews` | Отзывы с модальным просмотром скриншотов |
| `/faq` | Accordion с частыми вопросами |
| `/admin` | Вход в панель (нет ссылок с сайта) |
| `/admin/dashboard` | Панель управления |

---

## API

**Публичные:**
- `GET /api/reviews`
- `GET /api/courses`
- `GET /api/faq`
- `GET /api/news`
- `POST /api/contact` — форма обратной связи (лимит: 5/час)
- `POST /api/enroll` — запись на курс (лимит: 10/час)

**Только для администратора:**
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/stats`
- CRUD для reviews, courses, faq, news, messages, enrollments

---

## Безопасность

- Пароли: bcrypt с солью
- Защита от brute-force: 5 попыток → блокировка 5 минут
- Rate limiting: вход 10/мин, контакт 5/час, запись 10/час
- Honeypot на форме обратной связи
- Session cookie: HttpOnly + SameSite=Lax
- robots.txt: `Disallow: /admin`
- Страницы /admin: `noindex, nofollow`
- Параметризованные SQL-запросы (защита от SQL-инъекций)
- textContent вместо innerHTML для пользовательских данных

---

## Настройка

### Переменные окружения

Все опциональны — по умолчанию приложение запускается в безопасном режиме (без отладчика, только localhost).

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `SECRET_KEY` | генерируется в `.secret_key` | Секретный ключ сессий. В проде задайте свой. |
| `FLASK_DEBUG` | `0` (выкл) | Отладчик Werkzeug. `1` — только для разработки, **никогда в проде** (риск RCE). |
| `HOST` | `127.0.0.1` | Адрес прослушивания. `0.0.0.0` — доступ из локальной сети (например, проверка с телефона). |
| `PORT` | `5000` | Порт. |
| `SESSION_COOKIE_SECURE` | `0` (выкл) | `1` — сессионная кука только по HTTPS. Включать в проде. |

Примеры:

```bash
# Разработка с отладчиком
FLASK_DEBUG=1 python app.py

# Доступ с телефона в локальной сети
HOST=0.0.0.0 python app.py
```

### OG-изображение

OG-картинка: `static/icons/og-image-v3.png` (1200×630 пикселей). Подключена во всех страницах через теги `og:image` и `twitter:image`.

### Информация о преподавателе

Отредактируйте блок в `static/index.html` (поиск по "Имя Отчество Фамилия").

### Продакшн

Запускайте через Gunicorn за HTTPS-прокси (nginx):

```bash
pip install gunicorn
SECRET_KEY="ваш-ключ" SESSION_COOKIE_SECURE=1 gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

- `SESSION_COOKIE_SECURE=1` — кука сессии только по HTTPS.
- Заголовок HSTS включается автоматически на HTTPS-запросах.
- Отладчик (`FLASK_DEBUG`) в проде **не включать**.
- При запуске через Gunicorn блок `app.run(...)` не используется.

### Безопасность (заголовки)

На каждый ответ выставляются: `Content-Security-Policy` (скрипты только свои),
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy`, а на HTTPS — `Strict-Transport-Security`.
