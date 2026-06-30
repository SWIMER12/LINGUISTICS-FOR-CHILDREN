import os
import json
import sqlite3
import re
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
from flask import Flask, request, jsonify, session, send_from_directory
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
DB_PATH = os.path.join(BASE_DIR, 'database.db')
SECRET_KEY_FILE = os.path.join(BASE_DIR, '.secret_key')

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# .webmanifest по умолчанию не имеет зарегистрированного MIME — задаём явно.
import mimetypes
mimetypes.add_type('application/manifest+json', '.webmanifest')


def get_secret_key():
    if os.environ.get('SECRET_KEY'):
        return os.environ['SECRET_KEY']
    if os.path.exists(SECRET_KEY_FILE):
        with open(SECRET_KEY_FILE) as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    with open(SECRET_KEY_FILE, 'w') as f:
        f.write(key)
    return key


app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
app.secret_key = get_secret_key()
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10 MB max upload
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
# В проде (HTTPS) включить: SESSION_COOKIE_SECURE=1 — кука сессии не уйдёт по HTTP.
# По умолчанию выключено, иначе ломается локальный вход в админку по http://localhost.
app.config['SESSION_COOKIE_SECURE'] = (
    os.environ.get('SESSION_COOKIE_SECURE', '').lower() in ('1', 'true', 'yes', 'on')
)

limiter = Limiter(
    get_remote_address,
    app=app,
    storage_uri='memory://',
    default_limits=[]
)

ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_IMG_SIZE = 10 * 1024 * 1024

# Расширения статичных ассетов — для них выставляем длинный Cache-Control.
STATIC_ASSET_EXT = {
    'css', 'js', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico',
    'woff', 'woff2', 'ttf', 'webmanifest',
}


# ─── Security headers ────────────────────────────────────────────────────────────

# CSP: скрипты только свои (script-src 'self') — inline-скриптов на сайте нет.
# Стили допускают inline (style="...") — они используются в разметке, риск низкий.
# img-src data: нужен для SVG/иконок; frame-ancestors 'none' — защита от кликджекинга.
CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'"
)


@app.errorhandler(404)
def not_found(e):
    # Для API — JSON, для остального — брендированная страница.
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Не найдено'}), 404
    return send_from_directory(STATIC_DIR, '404.html'), 404


@app.errorhandler(500)
def server_error(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500
    return send_from_directory(STATIC_DIR, '500.html'), 500


@app.after_request
def set_security_headers(resp):
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['X-Frame-Options'] = 'DENY'
    resp.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    resp.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    resp.headers['Content-Security-Policy'] = CSP
    # HSTS только поверх HTTPS, чтобы не ломать локальную разработку по HTTP.
    if request.is_secure:
        resp.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

    # Кэширование: статичные ассеты — на сутки, HTML/API — без кэша (чтобы правки
    # и данные обновлялись сразу). Полноценное сжатие (gzip/brotli) — на nginx в проде.
    # (Flask по умолчанию ставит no-cache на статику — для ассетов перезаписываем.)
    if request.path.rsplit('.', 1)[-1].lower() in STATIC_ASSET_EXT:
        resp.headers['Cache-Control'] = 'public, max-age=86400'
    elif 'Cache-Control' not in resp.headers:
        resp.headers['Cache-Control'] = 'no-cache'
    return resp


# ─── Database ──────────────────────────────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


VALID_COURSE_STATUSES  = {'open', 'ongoing', 'finished', 'upcoming', 'custom', 'closed'}
VALID_LECTURE_STATUSES = {'open', 'finished', 'upcoming', 'custom', 'closed'}


def init_db():
    with get_db() as conn:
        # Migrations
        for migration in [
            'ALTER TABLE homepage_blocks ADD COLUMN image_ratio TEXT DEFAULT "3:2"',
            'ALTER TABLE homepage_images ADD COLUMN image_ratio TEXT DEFAULT "3:2"',
            'ALTER TABLE courses ADD COLUMN description TEXT DEFAULT ""',
            'ALTER TABLE courses ADD COLUMN price_month INTEGER DEFAULT 0',
            'ALTER TABLE courses ADD COLUMN price_lesson INTEGER DEFAULT 0',
            'ALTER TABLE courses ADD COLUMN subject TEXT DEFAULT ""',
            'ALTER TABLE courses ADD COLUMN custom_status_label TEXT DEFAULT ""',
            'ALTER TABLE courses ADD COLUMN lesson_count TEXT DEFAULT ""',
            'ALTER TABLE courses ADD COLUMN dates TEXT DEFAULT ""',
            'ALTER TABLE courses ADD COLUMN schedule TEXT DEFAULT ""',
            'ALTER TABLE courses ADD COLUMN price_type TEXT DEFAULT "month"',
            'ALTER TABLE courses ADD COLUMN enrollment_open INTEGER DEFAULT 1',
            'ALTER TABLE courses ADD COLUMN enrollment_link TEXT DEFAULT ""',
            'ALTER TABLE courses ADD COLUMN is_free INTEGER DEFAULT 0',
            'ALTER TABLE messages ADD COLUMN contact_method TEXT DEFAULT "email"',
            'ALTER TABLE projects ADD COLUMN price INTEGER DEFAULT 0',
            'ALTER TABLE photos ADD COLUMN photo_date TEXT DEFAULT ""',
            'ALTER TABLE news ADD COLUMN pub_date TEXT DEFAULT ""',
            'ALTER TABLE blog ADD COLUMN pub_date TEXT DEFAULT ""',
            'ALTER TABLE materials ADD COLUMN answer TEXT DEFAULT ""',
            'ALTER TABLE materials ADD COLUMN solution_image TEXT DEFAULT ""',
            'ALTER TABLE materials ADD COLUMN comment TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN lecture_date TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN lecture_time TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN lecturer_workplace TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN lecturer_degree TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN lecturer_bio TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN event_format TEXT DEFAULT "online"',
            'ALTER TABLE lectures ADD COLUMN event_format_text TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN event_type TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN price_suffix TEXT DEFAULT ""',
            'ALTER TABLE lectures ADD COLUMN sort_order INTEGER DEFAULT 0',
            'ALTER TABLE courses ADD COLUMN sort_order INTEGER DEFAULT 0',
            'ALTER TABLE reviews ADD COLUMN sort_order INTEGER DEFAULT 0',
            'ALTER TABLE materials ADD COLUMN sort_order INTEGER DEFAULT 0',
            'ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT 0',
        ]:
            try:
                conn.execute(migration)
            except Exception:
                pass

        conn.executescript('''
            CREATE TABLE IF NOT EXISTS admin_user (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                text TEXT NOT NULL,
                image_path TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                topics TEXT NOT NULL DEFAULT '[]',
                description TEXT DEFAULT '',
                age_range TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                current_participants INTEGER DEFAULT 0,
                max_participants INTEGER NOT NULL DEFAULT 10,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS enrollments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                age INTEGER NOT NULL,
                comment TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS faq (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                order_num INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                image_path TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS blog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                image_path TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT '',
                image_path TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                condition TEXT DEFAULT '',
                solution TEXT DEFAULT '',
                answer TEXT DEFAULT '',
                image_path TEXT,
                solution_image TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS material_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                original_name TEXT NOT NULL DEFAULT '',
                file_type TEXT NOT NULL DEFAULT 'file',
                FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS project_enrollments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                comment TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                image_path TEXT,
                age_range TEXT DEFAULT '',
                lesson_count TEXT DEFAULT '',
                dates TEXT DEFAULT '',
                schedule TEXT DEFAULT '',
                status TEXT DEFAULT 'open',
                custom_status_label TEXT DEFAULT '',
                enrollment_open INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS lectures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                lecturer_name TEXT DEFAULT '',
                lecturer_photo TEXT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                lecture_datetime TEXT DEFAULT '',
                status TEXT DEFAULT 'open',
                custom_status_label TEXT DEFAULT '',
                is_free INTEGER DEFAULT 0,
                price INTEGER DEFAULT 0,
                enrollment_open INTEGER DEFAULT 1,
                enrollment_link TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS lecture_enrollments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lecture_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS homepage_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                block_key TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                image_path TEXT,
                order_num INTEGER DEFAULT 0,
                is_visible INTEGER DEFAULT 1,
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS homepage_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                block_key TEXT NOT NULL,
                image_path TEXT NOT NULL,
                order_num INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );
        ''')
        _hp_blocks = [
            ('intro',                   'Вводный блок',                                          1),
            ('project_origin',          'Как появился проект «Лингвистика для детей»?',          2),
            ('courses_list',            'В 2024-2026 годах я провела следующие курсы:',           3),
            ('travel_notes',            '«Путевые заметки»',                                     4),
            ('my_universities',         'Мои университеты',                                      5),
            ('philology_experience',    'Опыт работы в сфере филологии',                         6),
            ('teaching_experience',     'Опыт преподавания',                                     7),
            ('olympiad_participation',  'Участие в делах олимпиадных',                           8),
            ('education_diplomas',      'Дипломы об образовании',                                9),
        ]
        for bkey, btitle, bord in _hp_blocks:
            conn.execute(
                'INSERT OR IGNORE INTO homepage_blocks (block_key, title, order_num) VALUES (?,?,?)',
                (bkey, btitle, bord)
            )

        row = conn.execute('SELECT id FROM admin_user LIMIT 1').fetchone()
        if not row:
            pw = 'admin123'
            pw_hash = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
            conn.execute(
                'INSERT INTO admin_user (username, password_hash) VALUES (?, ?)',
                ('admin', pw_hash)
            )
            print(f'\n{"="*50}')
            print(f'  Admin created: login=admin  password={pw}')
            print(f'  CHANGE THE PASSWORD IN /admin AFTER FIRST LOGIN!')
            print(f'{"="*50}\n')


# ─── Helpers ───────────────────────────────────────────────────────────────────

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT


def valid_email(email):
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email))


def save_image(file, prefix):
    if not file or not file.filename:
        return None
    if not allowed_file(file.filename):
        return None
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_IMG_SIZE:
        return None
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = secure_filename(
        f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.{ext}"
    )
    file.save(os.path.join(UPLOAD_DIR, filename))
    return f'/uploads/{filename}'


def remove_image(path):
    if path:
        full = os.path.join(UPLOAD_DIR, os.path.basename(path))
        if os.path.exists(full):
            os.remove(full)


def require_admin(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not session.get('admin'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return wrapped


def clip(s, maxlen):
    return str(s).strip()[:maxlen] if s is not None else ''


ALLOWED_FILE_EXT = {
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
    'mp4', 'avi', 'mov', 'mkv', 'webm',
    'png', 'jpg', 'jpeg', 'gif', 'webp',
    'txt', 'zip',
}

def save_file(file, prefix='file'):
    if not file or not file.filename:
        return None, None
    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'bin'
    # Принимаем только разрешённые расширения (защита от загрузки .html/.svg/.py и т.п.).
    if ext not in ALLOWED_FILE_EXT:
        return None, None
    unique_name = f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.{ext}"
    file.save(os.path.join(UPLOAD_DIR, unique_name))
    return f'/uploads/{unique_name}', filename

def get_file_type(filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext in ('jpg', 'jpeg', 'png', 'gif', 'webp'):
        return 'image'
    if ext in ('doc', 'docx'):
        return 'word'
    if ext == 'pdf':
        return 'pdf'
    if ext in ('mp4', 'avi', 'mov', 'mkv', 'webm'):
        return 'video'
    return 'file'


def cleanup_old_news():
    cutoff = (datetime.now() - timedelta(days=60)).strftime('%Y-%m-%d %H:%M:%S')
    with get_db() as conn:
        old = conn.execute(
            'SELECT image_path FROM news WHERE created_at < ?', (cutoff,)
        ).fetchall()
        for r in old:
            remove_image(r['image_path'])
        conn.execute('DELETE FROM news WHERE created_at < ?', (cutoff,))


# ─── Pages ─────────────────────────────────────────────────────────────────────

@app.route('/')
def page_index():
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/reviews')
def page_reviews():
    return send_from_directory(STATIC_DIR, 'reviews.html')


@app.route('/courses')
def page_courses():
    return send_from_directory(STATIC_DIR, 'courses.html')


@app.route('/faq')
def page_faq():
    return send_from_directory(STATIC_DIR, 'faq.html')


@app.route('/news')
def page_news():
    return send_from_directory(STATIC_DIR, 'news.html')


@app.route('/projects')
def page_projects():
    return send_from_directory(STATIC_DIR, 'projects.html')


@app.route('/blog')
def page_blog():
    return send_from_directory(STATIC_DIR, 'blog.html')


@app.route('/photos')
def page_photos():
    return send_from_directory(STATIC_DIR, 'photos.html')


@app.route('/materials')
def page_materials():
    return send_from_directory(STATIC_DIR, 'materials.html')


@app.route('/admin')
@app.route('/admin/')
def page_admin():
    return send_from_directory(os.path.join(STATIC_DIR, 'admin'), 'index.html')


@app.route('/admin/dashboard')
def page_admin_dashboard():
    return send_from_directory(os.path.join(STATIC_DIR, 'admin'), 'dashboard.html')


@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ─── Иконки и og-картинка ───────────────────────────────────────────────────────
# Браузеры/iOS автоматически запрашивают эти пути; без них в логах сыпались 404.
# Отдаём логотип (SVG) — отдельных файлов .ico/.png в проекте нет.
@app.route('/favicon.ico')
@app.route('/apple-touch-icon.png')
@app.route('/apple-touch-icon-precomposed.png')
@app.route('/images/og')
def site_icon():
    return send_from_directory(os.path.join(STATIC_DIR, 'icons'), 'favicon.svg', mimetype='image/svg+xml')


# ─── Sitemap ───────────────────────────────────────────────────────────────────

@app.route('/robots.txt')
def robots():
    from flask import Response
    host = request.host_url.rstrip('/')
    txt = (
        'User-agent: *\n'
        'Allow: /\n'
        'Disallow: /admin\n'
        'Disallow: /admin/\n'
        'Disallow: /api/\n'
        f'\nSitemap: {host}/sitemap.xml\n'
    )
    return Response(txt, mimetype='text/plain')


@app.route('/sitemap.xml')
def sitemap():
    from flask import Response
    import datetime
    today = datetime.date.today().isoformat()

    static_pages = [
        ('/', '1.0', 'weekly'),
        ('/courses', '0.9', 'weekly'),
        ('/projects', '0.8', 'weekly'),
        ('/news', '0.7', 'weekly'),
        ('/blog', '0.7', 'weekly'),
        ('/materials', '0.6', 'monthly'),
        ('/photos', '0.5', 'monthly'),
        ('/reviews', '0.5', 'monthly'),
        ('/faq', '0.5', 'monthly'),
    ]

    host = request.host_url.rstrip('/')
    urls = []
    for path, priority, freq in static_pages:
        urls.append(f'''  <url>
    <loc>{host}{path}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{priority}</priority>
  </url>''')

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += '\n'.join(urls)
    xml += '\n</urlset>'
    return Response(xml, mimetype='application/xml')


# ─── Auth ──────────────────────────────────────────────────────────────────────

_login_fails = {}  # ip -> (count, first_fail_time)


@app.route('/api/admin/login', methods=['POST'])
@limiter.limit('10 per minute')
def api_login():
    data = request.get_json(silent=True) or {}
    ip = request.remote_addr or 'unknown'
    now = datetime.now()

    fails = _login_fails.get(ip, (0, now))
    if fails[0] >= 5:
        if (now - fails[1]).total_seconds() < 300:
            return jsonify({'error': 'Слишком много попыток. Подождите 5 минут.'}), 429
        _login_fails.pop(ip, None)

    username = clip(data.get('username'), 100)
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': 'Введите логин и пароль'}), 400

    with get_db() as conn:
        row = conn.execute(
            'SELECT * FROM admin_user WHERE username = ?', (username,)
        ).fetchone()

    if not row or not bcrypt.checkpw(password.encode(), row['password_hash'].encode()):
        count, first = _login_fails.get(ip, (0, now))
        _login_fails[ip] = (count + 1, first if count > 0 else now)
        return jsonify({'error': 'Неверный логин или пароль'}), 401

    _login_fails.pop(ip, None)
    session.permanent = True
    session['admin'] = True
    session['admin_user'] = row['username']
    return jsonify({'ok': True, 'username': row['username']})


@app.route('/api/admin/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'ok': True})


@app.route('/api/admin/check')
def api_check():
    return jsonify({
        'ok': bool(session.get('admin')),
        'username': session.get('admin_user', '')
    })


@app.route('/api/admin/change-password', methods=['POST'])
@require_admin
def api_change_password():
    data = request.get_json(silent=True) or {}
    old_pw = data.get('old_password', '')
    new_pw = data.get('new_password', '')
    if not old_pw or not new_pw:
        return jsonify({'error': 'Заполните все поля'}), 400
    if len(new_pw) < 8:
        return jsonify({'error': 'Пароль минимум 8 символов'}), 400
    username = session.get('admin_user', 'admin')
    with get_db() as conn:
        row = conn.execute(
            'SELECT * FROM admin_user WHERE username=?', (username,)
        ).fetchone()
        if not row or not bcrypt.checkpw(old_pw.encode(), row['password_hash'].encode()):
            return jsonify({'error': 'Неверный текущий пароль'}), 401
        new_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
        conn.execute(
            'UPDATE admin_user SET password_hash=? WHERE username=?',
            (new_hash, username)
        )
    return jsonify({'ok': True})


# ─── Contact ───────────────────────────────────────────────────────────────────

@app.route('/api/contact', methods=['POST'])
@limiter.limit('5 per hour')
def api_contact():
    data = request.get_json(silent=True) or {}
    if data.get('website'):  # honeypot
        return jsonify({'ok': True})

    name = clip(data.get('name'), 100)
    email = clip(data.get('email'), 200)
    message = clip(data.get('message'), 2000)
    contact_method = clip(data.get('contact_method', 'email'), 20)

    if not name or not email or not message:
        return jsonify({'error': 'Все поля обязательны'}), 400

    with get_db() as conn:
        conn.execute(
            'INSERT INTO messages (name, email, message, contact_method) VALUES (?, ?, ?, ?)',
            (name, email, message, contact_method)
        )
    return jsonify({'ok': True})


# ─── Reviews ───────────────────────────────────────────────────────────────────

@app.route('/api/reviews')
def api_reviews():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM reviews ORDER BY sort_order ASC, created_at ASC').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/reviews', methods=['POST'])
@require_admin
def api_add_review():
    name = clip(request.form.get('name'), 100)
    text = clip(request.form.get('text'), 2000)
    if not name or not text:
        return jsonify({'error': 'Имя и текст обязательны'}), 400
    image_path = save_image(request.files.get('image'), 'review')
    with get_db() as conn:
        conn.execute(
            'INSERT INTO reviews (name, text, image_path) VALUES (?, ?, ?)',
            (name, text, image_path)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/reviews/<int:rid>', methods=['DELETE'])
@require_admin
def api_del_review(rid):
    with get_db() as conn:
        row = conn.execute('SELECT image_path FROM reviews WHERE id=?', (rid,)).fetchone()
        if row:
            remove_image(row['image_path'])
        conn.execute('DELETE FROM reviews WHERE id=?', (rid,))
    return jsonify({'ok': True})


@app.route('/api/admin/reviews/reorder', methods=['POST'])
@require_admin
def api_reorder_reviews():
    items = request.get_json(force=True) or []
    with get_db() as conn:
        for item in items:
            conn.execute('UPDATE reviews SET sort_order=? WHERE id=?',
                         (int(item['order']), int(item['id'])))
    return jsonify({'ok': True})


# ─── Courses ───────────────────────────────────────────────────────────────────

@app.route('/api/courses')
def api_courses():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM courses ORDER BY sort_order ASC, created_at ASC').fetchall()
    result = []
    for r in rows:
        c = dict(r)
        c['topics'] = json.loads(c.get('topics') or '[]')
        result.append(c)
    return jsonify(result)


@app.route('/api/admin/courses', methods=['POST'])
@require_admin
def api_add_course():
    data = request.get_json(silent=True) or {}
    title              = clip(data.get('title'), 200)
    age_range          = clip(data.get('age_range'), 50)
    description        = clip(data.get('description', ''), 2000)
    status             = data.get('status', 'open')
    topics             = data.get('topics', [])
    is_free            = 1 if data.get('is_free') else 0
    price_month        = 0 if is_free else int(data.get('price_month', 0) or 0)
    custom_status_label = clip(data.get('custom_status_label', ''), 50)
    lesson_count       = clip(data.get('lesson_count', ''), 100)
    dates              = clip(data.get('dates', ''), 200)
    schedule           = clip(data.get('schedule', ''), 200)
    price_type         = data.get('price_type', 'month')
    if price_type not in ('month', 'course'):
        price_type = 'month'
    enrollment_open    = 1 if data.get('enrollment_open', True) else 0
    enrollment_link    = clip(data.get('enrollment_link', ''), 500)

    if not title or not age_range:
        return jsonify({'error': 'Название и возраст обязательны'}), 400
    if status not in VALID_COURSE_STATUSES:
        status = 'open'
    if not isinstance(topics, list):
        topics = []
    topics = [str(t)[:50] for t in topics[:20]]

    with get_db() as conn:
        conn.execute(
            'INSERT INTO courses (title, topics, description, age_range, status, price_month, custom_status_label, lesson_count, dates, schedule, price_type, enrollment_open, enrollment_link, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (title, json.dumps(topics, ensure_ascii=False), description, age_range, status, price_month, custom_status_label, lesson_count, dates, schedule, price_type, enrollment_open, enrollment_link, is_free)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/courses/<int:cid>', methods=['PUT'])
@require_admin
def api_update_course(cid):
    data = request.get_json(silent=True) or {}
    with get_db() as conn:
        row = conn.execute('SELECT * FROM courses WHERE id=?', (cid,)).fetchone()
        if not row:
            return jsonify({'error': 'Не найдено'}), 404

        title               = clip(data.get('title', row['title']), 200)
        age_range           = clip(data.get('age_range', row['age_range']), 50)
        description         = clip(data.get('description', row['description'] or ''), 2000)
        status              = data.get('status', row['status'])
        topics              = data.get('topics', json.loads(row['topics'] or '[]'))
        is_free             = 1 if data.get('is_free') else 0
        price_month         = 0 if is_free else int(data.get('price_month', row['price_month'] or 0) or 0)
        custom_status_label = clip(data.get('custom_status_label', row['custom_status_label'] or ''), 50)
        lesson_count        = clip(data.get('lesson_count', row['lesson_count'] or ''), 100)
        dates               = clip(data.get('dates', row['dates'] or ''), 200)
        schedule            = clip(data.get('schedule', row['schedule'] or ''), 200)
        price_type          = data.get('price_type', row['price_type'] or 'month')
        if price_type not in ('month', 'course'):
            price_type = 'month'
        enrollment_open     = 1 if data.get('enrollment_open', bool(row['enrollment_open'] if row['enrollment_open'] is not None else 1)) else 0
        enrollment_link     = clip(data.get('enrollment_link', row['enrollment_link'] or ''), 500)

        if status not in VALID_COURSE_STATUSES:
            status = row['status']
        if not isinstance(topics, list):
            topics = json.loads(row['topics'] or '[]')
        topics = [str(t)[:50] for t in topics[:20]]

        conn.execute(
            'UPDATE courses SET title=?, topics=?, description=?, age_range=?, status=?, price_month=?, custom_status_label=?, lesson_count=?, dates=?, schedule=?, price_type=?, enrollment_open=?, enrollment_link=?, is_free=? WHERE id=?',
            (title, json.dumps(topics, ensure_ascii=False), description, age_range, status, price_month, custom_status_label, lesson_count, dates, schedule, price_type, enrollment_open, enrollment_link, is_free, cid)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/courses/<int:cid>', methods=['DELETE'])
@require_admin
def api_del_course(cid):
    with get_db() as conn:
        conn.execute('DELETE FROM courses WHERE id=?', (cid,))
    return jsonify({'ok': True})


@app.route('/api/admin/courses/reorder', methods=['POST'])
@require_admin
def api_reorder_courses():
    items = request.get_json(force=True) or []
    with get_db() as conn:
        for item in items:
            conn.execute('UPDATE courses SET sort_order=? WHERE id=?',
                         (int(item['order']), int(item['id'])))
    return jsonify({'ok': True})


# ─── FAQ ───────────────────────────────────────────────────────────────────────

@app.route('/api/faq')
def api_faq():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM faq ORDER BY order_num, id').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/faq', methods=['POST'])
@require_admin
def api_add_faq():
    data = request.get_json(silent=True) or {}
    q = clip(data.get('question'), 500)
    a = clip(data.get('answer'), 3000)
    if not q or not a:
        return jsonify({'error': 'Вопрос и ответ обязательны'}), 400
    with get_db() as conn:
        conn.execute(
            'INSERT INTO faq (question, answer, order_num) VALUES (?, ?, ?)',
            (q, a, int(data.get('order_num', 0)))
        )
    return jsonify({'ok': True})


@app.route('/api/admin/faq/<int:fid>', methods=['PUT'])
@require_admin
def api_update_faq(fid):
    data = request.get_json(silent=True) or {}
    q = clip(data.get('question'), 500)
    a = clip(data.get('answer'), 3000)
    if not q or not a:
        return jsonify({'error': 'Вопрос и ответ обязательны'}), 400
    with get_db() as conn:
        conn.execute(
            'UPDATE faq SET question=?, answer=?, order_num=? WHERE id=?',
            (q, a, int(data.get('order_num', 0)), fid)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/faq/<int:fid>', methods=['DELETE'])
@require_admin
def api_del_faq(fid):
    with get_db() as conn:
        conn.execute('DELETE FROM faq WHERE id=?', (fid,))
    return jsonify({'ok': True})


@app.route('/api/admin/faq/reorder', methods=['POST'])
@require_admin
def api_reorder_faq():
    items = request.get_json(force=True) or []
    with get_db() as conn:
        for item in items:
            conn.execute('UPDATE faq SET order_num=? WHERE id=?',
                         (int(item['order']), int(item['id'])))
    return jsonify({'ok': True})


# ─── News ──────────────────────────────────────────────────────────────────────

@app.route('/api/news')
def api_news():
    cleanup_old_news()
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM news ORDER BY created_at DESC').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/news', methods=['POST'])
@require_admin
def api_add_news():
    from datetime import date as _date
    title = clip(request.form.get('title'), 300)
    text = clip(request.form.get('text'), 10000)
    if not title or not text:
        return jsonify({'error': 'Заголовок и текст обязательны'}), 400
    pub_date = clip(request.form.get('pub_date', ''), 20).strip()
    if not pub_date:
        pub_date = _date.today().strftime('%d.%m.%Y')
    image_path = save_image(request.files.get('image'), 'news')
    with get_db() as conn:
        conn.execute(
            'INSERT INTO news (title, text, image_path, pub_date) VALUES (?, ?, ?, ?)',
            (title, text, image_path, pub_date)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/news/<int:nid>', methods=['PUT'])
@require_admin
def api_update_news(nid):
    title = clip(request.form.get('title'), 300)
    text = clip(request.form.get('text'), 10000)
    with get_db() as conn:
        row = conn.execute('SELECT * FROM news WHERE id=?', (nid,)).fetchone()
        if not row:
            return jsonify({'error': 'Не найдено'}), 404
        image_path = row['image_path']
        new_img = save_image(request.files.get('image'), 'news')
        if new_img:
            remove_image(image_path)
            image_path = new_img
        pub_date = clip(request.form.get('pub_date', ''), 20).strip() or row['pub_date']
        conn.execute(
            'UPDATE news SET title=?, text=?, image_path=?, pub_date=? WHERE id=?',
            (title or row['title'], text or row['text'], image_path, pub_date, nid)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/news/<int:nid>', methods=['DELETE'])
@require_admin
def api_del_news(nid):
    with get_db() as conn:
        row = conn.execute('SELECT image_path FROM news WHERE id=?', (nid,)).fetchone()
        if row:
            remove_image(row['image_path'])
        conn.execute('DELETE FROM news WHERE id=?', (nid,))
    return jsonify({'ok': True})


# ─── Projects ─────────────────────────────────────────────────────────────────

@app.route('/api/projects')
def api_projects():
    with get_db() as conn:
        rows = conn.execute(
            'SELECT id, title, description, created_at FROM projects ORDER BY sort_order ASC, created_at ASC'
        ).fetchall()
        result = []
        for r in rows:
            p = dict(r)
            lects = conn.execute(
                'SELECT * FROM lectures WHERE project_id=? ORDER BY sort_order ASC, id ASC', (p['id'],)
            ).fetchall()
            p['lectures'] = [dict(l) for l in lects]
            result.append(p)
    return jsonify(result)


@app.route('/api/admin/projects', methods=['POST'])
@require_admin
def api_add_project():
    data        = request.get_json(silent=True) or {}
    title       = clip(data.get('title'), 200)
    description = clip(data.get('description', ''), 2000)
    if not title:
        return jsonify({'error': 'Название обязательно'}), 400
    with get_db() as conn:
        conn.execute(
            'INSERT INTO projects (title, description) VALUES (?,?)',
            (title, description)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/projects/<int:pid>', methods=['PUT'])
@require_admin
def api_update_project(pid):
    data = request.get_json(silent=True) or {}
    with get_db() as conn:
        row = conn.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
        if not row:
            return jsonify({'error': 'Не найдено'}), 404
        title       = clip(data.get('title', row['title']), 200)
        description = clip(data.get('description', row['description'] or ''), 2000)
        conn.execute(
            'UPDATE projects SET title=?, description=? WHERE id=?',
            (title, description, pid)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/projects/<int:pid>', methods=['DELETE'])
@require_admin
def api_del_project(pid):
    with get_db() as conn:
        row = conn.execute('SELECT image_path FROM projects WHERE id=?', (pid,)).fetchone()
        if row:
            remove_image(row['image_path'])
        conn.execute('DELETE FROM projects WHERE id=?', (pid,))
    return jsonify({'ok': True})


@app.route('/api/admin/projects/reorder', methods=['POST'])
@require_admin
def api_reorder_projects():
    items = request.get_json(force=True) or []
    with get_db() as conn:
        for item in items:
            conn.execute('UPDATE projects SET sort_order=? WHERE id=?',
                         (int(item['order']), int(item['id'])))
    return jsonify({'ok': True})


@app.route('/api/admin/lectures/reorder', methods=['POST'])
@require_admin
def api_reorder_lectures():
    items = request.get_json(force=True) or []
    with get_db() as conn:
        for item in items:
            conn.execute('UPDATE lectures SET sort_order=? WHERE id=?',
                         (int(item['order']), int(item['id'])))
    return jsonify({'ok': True})


# ─── Lectures ──────────────────────────────────────────────────────────────────

@app.route('/api/admin/lectures', methods=['POST'])
@require_admin
def api_add_lecture():
    project_id = int(request.form.get('project_id', 0) or 0)
    if not project_id:
        return jsonify({'error': 'project_id обязателен'}), 400
    title               = clip(request.form.get('title', ''), 200)
    if not title:
        return jsonify({'error': 'Название обязательно'}), 400
    lecturer_name       = clip(request.form.get('lecturer_name', ''), 200)
    lecturer_bio        = clip(request.form.get('lecturer_bio', ''), 1000)
    description         = clip(request.form.get('description', ''), 2000)
    lecture_datetime    = clip(request.form.get('lecture_datetime', ''), 200)
    event_format        = request.form.get('event_format', 'online')
    if event_format not in ('online', 'offline'):
        event_format = 'online'
    event_format_text   = clip(request.form.get('event_format_text', ''), 200)
    event_type          = clip(request.form.get('event_type', ''), 100)
    price_suffix        = clip(request.form.get('price_suffix', ''), 100)
    status              = request.form.get('status', 'open')
    if status not in VALID_LECTURE_STATUSES:
        status = 'open'
    custom_status_label = clip(request.form.get('custom_status_label', ''), 50)
    is_free             = 1 if request.form.get('is_free') == '1' else 0
    price               = 0 if is_free else int(request.form.get('price', 0) or 0)
    enrollment_open     = 1 if request.form.get('enrollment_open') == '1' else 0
    enrollment_link     = clip(request.form.get('enrollment_link', ''), 500)
    lecturer_photo      = save_image(request.files.get('lecturer_photo'), 'lecturer')
    with get_db() as conn:
        conn.execute(
            'INSERT INTO lectures (project_id, lecturer_name, lecturer_bio, lecturer_photo, title, description, lecture_datetime, event_format, event_format_text, event_type, price_suffix, status, custom_status_label, is_free, price, enrollment_open, enrollment_link) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (project_id, lecturer_name, lecturer_bio, lecturer_photo, title, description, lecture_datetime, event_format, event_format_text, event_type, price_suffix, status, custom_status_label, is_free, price, enrollment_open, enrollment_link)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/lectures/<int:lid>', methods=['PUT'])
@require_admin
def api_update_lecture(lid):
    with get_db() as conn:
        row = conn.execute('SELECT * FROM lectures WHERE id=?', (lid,)).fetchone()
        if not row:
            return jsonify({'error': 'Не найдено'}), 404
        lecturer_name       = clip(request.form.get('lecturer_name', row['lecturer_name'] or ''), 200)
        lecturer_bio        = clip(request.form.get('lecturer_bio', row['lecturer_bio'] or ''), 1000)
        title               = clip(request.form.get('title', row['title']), 200)
        description         = clip(request.form.get('description', row['description'] or ''), 2000)
        lecture_datetime    = clip(request.form.get('lecture_datetime', row['lecture_datetime'] or ''), 200)
        event_format        = request.form.get('event_format', row['event_format'] or 'online')
        if event_format not in ('online', 'offline'):
            event_format = 'online'
        event_format_text   = clip(request.form.get('event_format_text', row['event_format_text'] or ''), 200)
        event_type          = clip(request.form.get('event_type', row['event_type'] or ''), 100)
        price_suffix        = clip(request.form.get('price_suffix', row['price_suffix'] or ''), 100)
        status              = request.form.get('status', row['status'])
        if status not in VALID_LECTURE_STATUSES:
            status = row['status']
        custom_status_label = clip(request.form.get('custom_status_label', row['custom_status_label'] or ''), 50)
        is_free             = 1 if request.form.get('is_free') == '1' else 0
        price               = 0 if is_free else int(request.form.get('price', row['price'] or 0) or 0)
        enrollment_open     = 1 if request.form.get('enrollment_open') == '1' else 0
        enrollment_link     = clip(request.form.get('enrollment_link', row['enrollment_link'] or ''), 500)
        lecturer_photo      = row['lecturer_photo']
        new_photo = save_image(request.files.get('lecturer_photo'), 'lecturer')
        if new_photo:
            remove_image(lecturer_photo)
            lecturer_photo = new_photo
        elif request.form.get('remove_photo') == '1':
            remove_image(lecturer_photo)
            lecturer_photo = None
        conn.execute(
            'UPDATE lectures SET lecturer_name=?, lecturer_bio=?, lecturer_photo=?, title=?, description=?, lecture_datetime=?, event_format=?, event_format_text=?, event_type=?, price_suffix=?, status=?, custom_status_label=?, is_free=?, price=?, enrollment_open=?, enrollment_link=? WHERE id=?',
            (lecturer_name, lecturer_bio, lecturer_photo, title, description, lecture_datetime, event_format, event_format_text, event_type, price_suffix, status, custom_status_label, is_free, price, enrollment_open, enrollment_link, lid)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/lectures/<int:lid>', methods=['DELETE'])
@require_admin
def api_del_lecture(lid):
    with get_db() as conn:
        row = conn.execute('SELECT lecturer_photo FROM lectures WHERE id=?', (lid,)).fetchone()
        if row:
            remove_image(row['lecturer_photo'])
        conn.execute('DELETE FROM lectures WHERE id=?', (lid,))
    return jsonify({'ok': True})


@app.route('/api/lecture-enroll', methods=['POST'])
@limiter.limit('10 per hour')
def api_lecture_enroll():
    data       = request.get_json(silent=True) or {}
    lecture_id = data.get('lecture_id')
    name       = clip(data.get('name'), 100)
    email      = clip(data.get('email'), 200)
    if not all([lecture_id, name, email]):
        return jsonify({'error': 'Заполните все обязательные поля'}), 400
    with get_db() as conn:
        lecture = conn.execute('SELECT * FROM lectures WHERE id=?', (lecture_id,)).fetchone()
        if not lecture:
            return jsonify({'error': 'Лекция не найдена'}), 404
        if not lecture['enrollment_open']:
            return jsonify({'error': 'Запись на лекцию недоступна'}), 400
        conn.execute(
            'INSERT INTO lecture_enrollments (lecture_id, name, email) VALUES (?,?,?)',
            (int(lecture_id), name, email)
        )
    return jsonify({'ok': True})


@app.route('/api/project-enroll', methods=['POST'])
@limiter.limit('10 per hour')
def api_project_enroll():
    data = request.get_json(silent=True) or {}
    project_id = data.get('project_id')
    name    = clip(data.get('name'), 100)
    email   = clip(data.get('email'), 200)
    comment = clip(data.get('comment', ''), 500)
    if not all([project_id, name, email]):
        return jsonify({'error': 'Заполните все обязательные поля'}), 400
    with get_db() as conn:
        project = conn.execute('SELECT * FROM projects WHERE id=?', (project_id,)).fetchone()
        if not project:
            return jsonify({'error': 'Проект не найден'}), 404
        if not project['enrollment_open']:
            return jsonify({'error': 'Запись на проект недоступна'}), 400
        conn.execute(
            'INSERT INTO project_enrollments (project_id, name, email, comment) VALUES (?,?,?,?)',
            (int(project_id), name, email, comment)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/project-enrollments/<int:eid>', methods=['PUT'])
@require_admin
def api_update_project_enrollment(eid):
    data = request.get_json(silent=True) or {}
    status = data.get('status', 'pending')
    if status not in ('pending', 'confirmed', 'cancelled'):
        return jsonify({'error': 'Неверный статус'}), 400
    with get_db() as conn:
        conn.execute('UPDATE project_enrollments SET status=? WHERE id=?', (status, eid))
    return jsonify({'ok': True})


@app.route('/api/admin/project-enrollments/<int:eid>', methods=['DELETE'])
@require_admin
def api_del_project_enrollment(eid):
    with get_db() as conn:
        conn.execute('DELETE FROM project_enrollments WHERE id=?', (eid,))
    return jsonify({'ok': True})


# ─── Blog ──────────────────────────────────────────────────────────────────────

@app.route('/api/blog')
def api_blog():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM blog ORDER BY created_at DESC').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/blog', methods=['POST'])
@require_admin
def api_add_blog():
    from datetime import date as _date
    title = clip(request.form.get('title'), 300)
    text = clip(request.form.get('text'), 10000)
    if not title or not text:
        return jsonify({'error': 'Заголовок и текст обязательны'}), 400
    pub_date = clip(request.form.get('pub_date', ''), 20).strip()
    if not pub_date:
        pub_date = _date.today().strftime('%d.%m.%Y')
    image_path = save_image(request.files.get('image'), 'blog')
    with get_db() as conn:
        conn.execute(
            'INSERT INTO blog (title, text, image_path, pub_date) VALUES (?, ?, ?, ?)',
            (title, text, image_path, pub_date)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/blog/<int:bid>', methods=['PUT'])
@require_admin
def api_update_blog(bid):
    title = clip(request.form.get('title'), 300)
    text = clip(request.form.get('text'), 10000)
    with get_db() as conn:
        row = conn.execute('SELECT * FROM blog WHERE id=?', (bid,)).fetchone()
        if not row:
            return jsonify({'error': 'Не найдено'}), 404
        image_path = row['image_path']
        new_img = save_image(request.files.get('image'), 'blog')
        if new_img:
            remove_image(image_path)
            image_path = new_img
        pub_date = clip(request.form.get('pub_date', ''), 20).strip() or row['pub_date']
        conn.execute(
            'UPDATE blog SET title=?, text=?, image_path=?, pub_date=? WHERE id=?',
            (title or row['title'], text or row['text'], image_path, pub_date, bid)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/blog/<int:bid>', methods=['DELETE'])
@require_admin
def api_del_blog(bid):
    with get_db() as conn:
        row = conn.execute('SELECT image_path FROM blog WHERE id=?', (bid,)).fetchone()
        if row:
            remove_image(row['image_path'])
        conn.execute('DELETE FROM blog WHERE id=?', (bid,))
    return jsonify({'ok': True})


# ─── Photos ────────────────────────────────────────────────────────────────────

@app.route('/api/photos')
def api_photos():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM photos ORDER BY created_at DESC').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/photos', methods=['POST'])
@require_admin
def api_add_photo():
    from datetime import date as _date
    title = clip(request.form.get('title', ''), 200)
    photo_date = clip(request.form.get('photo_date', ''), 20).strip()
    if not photo_date:
        photo_date = _date.today().strftime('%d.%m.%Y')
    image_path = save_image(request.files.get('image'), 'photo')
    if not image_path:
        return jsonify({'error': 'Изображение обязательно'}), 400
    with get_db() as conn:
        conn.execute(
            'INSERT INTO photos (title, image_path, photo_date) VALUES (?, ?, ?)',
            (title, image_path, photo_date)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/photos/<int:pid>', methods=['DELETE'])
@require_admin
def api_del_photo(pid):
    with get_db() as conn:
        row = conn.execute('SELECT image_path FROM photos WHERE id=?', (pid,)).fetchone()
        if row:
            remove_image(row['image_path'])
        conn.execute('DELETE FROM photos WHERE id=?', (pid,))
    return jsonify({'ok': True})


# ─── Materials ─────────────────────────────────────────────────────────────────

@app.route('/api/materials')
def api_materials():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM materials ORDER BY sort_order ASC, created_at ASC').fetchall()
        result = []
        for r in rows:
            m = dict(r)
            files = conn.execute(
                'SELECT * FROM material_files WHERE material_id=? ORDER BY id',
                (r['id'],)
            ).fetchall()
            m['files'] = [dict(f) for f in files]
            result.append(m)
    return jsonify(result)


@app.route('/api/admin/materials', methods=['POST'])
@require_admin
def api_add_material():
    title = clip(request.form.get('title', ''), 200)
    if not title:
        return jsonify({'error': 'title required'}), 400
    condition = clip(request.form.get('condition', ''), 5000)
    solution = clip(request.form.get('solution', ''), 5000)
    answer = clip(request.form.get('answer', ''), 500)
    comment = clip(request.form.get('comment', ''), 3000)
    img_path = None
    if 'image' in request.files and request.files['image'].filename:
        img_path = save_image(request.files['image'], prefix='mat')
    sol_img_path = None
    if 'solution_image' in request.files and request.files['solution_image'].filename:
        sol_img_path = save_image(request.files['solution_image'], prefix='matsol')
    with get_db() as conn:
        cur = conn.execute(
            'INSERT INTO materials (title, condition, solution, answer, comment, image_path, solution_image) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (title, condition, solution, answer, comment, img_path, sol_img_path)
        )
        mid = cur.lastrowid
        for f in request.files.getlist('files'):
            fpath, fname = save_file(f, prefix='matf')
            if fpath:
                ftype = get_file_type(fname)
                conn.execute(
                    'INSERT INTO material_files (material_id, file_path, original_name, file_type) VALUES (?, ?, ?, ?)',
                    (mid, fpath, fname, ftype)
                )
    return jsonify({'ok': True, 'id': mid})


@app.route('/api/admin/materials/<int:mid>', methods=['PUT'])
@require_admin
def api_update_material(mid):
    with get_db() as conn:
        row = conn.execute('SELECT * FROM materials WHERE id=?', (mid,)).fetchone()
        if not row:
            return jsonify({'error': 'not found'}), 404
        title = clip(request.form.get('title', row['title']), 200)
        condition = clip(request.form.get('condition', row['condition']), 5000)
        solution = clip(request.form.get('solution', row['solution']), 5000)
        answer = clip(request.form.get('answer', row['answer'] if row['answer'] else ''), 500)
        comment = clip(request.form.get('comment', row['comment'] if row['comment'] else ''), 3000)
        img_path = row['image_path']
        if 'image' in request.files and request.files['image'].filename:
            remove_image(img_path)
            img_path = save_image(request.files['image'], prefix='mat')
        elif request.form.get('remove_image') == '1':
            remove_image(img_path)
            img_path = None
        sol_img_path = row['solution_image'] if row['solution_image'] else None
        if 'solution_image' in request.files and request.files['solution_image'].filename:
            remove_image(sol_img_path)
            sol_img_path = save_image(request.files['solution_image'], prefix='matsol')
        elif request.form.get('remove_solution_image') == '1':
            remove_image(sol_img_path)
            sol_img_path = None
        conn.execute(
            'UPDATE materials SET title=?, condition=?, solution=?, answer=?, comment=?, image_path=?, solution_image=? WHERE id=?',
            (title, condition, solution, answer, comment, img_path, sol_img_path, mid)
        )
        for f in request.files.getlist('files'):
            fpath, fname = save_file(f, prefix='matf')
            if fpath:
                ftype = get_file_type(fname)
                conn.execute(
                    'INSERT INTO material_files (material_id, file_path, original_name, file_type) VALUES (?, ?, ?, ?)',
                    (mid, fpath, fname, ftype)
                )
    return jsonify({'ok': True})


@app.route('/api/admin/materials/<int:mid>', methods=['DELETE'])
@require_admin
def api_del_material(mid):
    with get_db() as conn:
        row = conn.execute('SELECT image_path, solution_image FROM materials WHERE id=?', (mid,)).fetchone()
        if row:
            remove_image(row['image_path'])
            remove_image(row['solution_image'])
            files = conn.execute('SELECT file_path FROM material_files WHERE material_id=?', (mid,)).fetchall()
            for f in files:
                try:
                    full = os.path.join(BASE_DIR, f['file_path'].lstrip('/'))
                    if os.path.exists(full):
                        os.remove(full)
                except Exception:
                    pass
        conn.execute('DELETE FROM materials WHERE id=?', (mid,))
    return jsonify({'ok': True})


@app.route('/api/admin/materials/reorder', methods=['POST'])
@require_admin
def api_reorder_materials():
    items = request.get_json(force=True) or []
    with get_db() as conn:
        for item in items:
            conn.execute('UPDATE materials SET sort_order=? WHERE id=?',
                         (int(item['order']), int(item['id'])))
    return jsonify({'ok': True})


@app.route('/api/admin/material-files/<int:fid>', methods=['DELETE'])
@require_admin
def api_del_material_file(fid):
    with get_db() as conn:
        row = conn.execute('SELECT file_path FROM material_files WHERE id=?', (fid,)).fetchone()
        if row:
            try:
                full = os.path.join(BASE_DIR, row['file_path'].lstrip('/'))
                if os.path.exists(full):
                    os.remove(full)
            except Exception:
                pass
            conn.execute('DELETE FROM material_files WHERE id=?', (fid,))
    return jsonify({'ok': True})


# ─── Messages ──────────────────────────────────────────────────────────────────

@app.route('/api/admin/messages')
@require_admin
def api_messages():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM messages ORDER BY created_at DESC').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/messages/<int:mid>/read', methods=['PUT'])
@require_admin
def api_read_msg(mid):
    with get_db() as conn:
        conn.execute('UPDATE messages SET is_read=1 WHERE id=?', (mid,))
    return jsonify({'ok': True})


@app.route('/api/admin/messages/<int:mid>', methods=['DELETE'])
@require_admin
def api_del_msg(mid):
    with get_db() as conn:
        conn.execute('DELETE FROM messages WHERE id=?', (mid,))
    return jsonify({'ok': True})


# ─── Homepage blocks ───────────────────────────────────────────────────────────

VALID_HP_KEYS = {
    'intro', 'project_origin', 'courses_list', 'travel_notes',
    'my_universities', 'philology_experience', 'teaching_experience',
    'olympiad_participation', 'education_diplomas',
}

GALLERY_BLOCKS = {'olympiad_participation', 'education_diplomas'}


@app.route('/api/homepage')
def api_homepage():
    with get_db() as conn:
        blocks = conn.execute(
            'SELECT * FROM homepage_blocks ORDER BY order_num'
        ).fetchall()
        images = conn.execute(
            'SELECT * FROM homepage_images ORDER BY order_num, id'
        ).fetchall()
    imgs_by_key = {}
    for img in images:
        imgs_by_key.setdefault(img['block_key'], []).append(dict(img))
    result = []
    for b in blocks:
        bd = dict(b)
        bd['images'] = imgs_by_key.get(b['block_key'], [])
        result.append(bd)
    return jsonify(result)


@app.route('/api/admin/homepage/<block_key>', methods=['PUT'])
@require_admin
def api_update_hp_block(block_key):
    if block_key not in VALID_HP_KEYS:
        return jsonify({'error': 'Неверный ключ блока'}), 400
    data = request.get_json(silent=True) or {}
    title       = clip(data.get('title', ''), 300)
    content     = clip(data.get('content', ''), 20000)
    image_ratio = data.get('image_ratio', '3:2')
    if image_ratio not in ('3:2', '2:3', '3:1'):
        image_ratio = '3:2'
    with get_db() as conn:
        conn.execute(
            'UPDATE homepage_blocks SET title=?, content=?, image_ratio=?, updated_at=datetime("now","localtime") WHERE block_key=?',
            (title, content, image_ratio, block_key)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/homepage/<block_key>/image', methods=['POST'])
@require_admin
def api_upload_hp_image(block_key):
    if block_key not in VALID_HP_KEYS:
        return jsonify({'error': 'Неверный ключ блока'}), 400
    img = save_image(request.files.get('image'), f'hp_{block_key}')
    if not img:
        return jsonify({'error': 'Изображение обязательно'}), 400
    with get_db() as conn:
        row = conn.execute(
            'SELECT image_path FROM homepage_blocks WHERE block_key=?', (block_key,)
        ).fetchone()
        if row and row['image_path']:
            remove_image(row['image_path'])
        conn.execute(
            'UPDATE homepage_blocks SET image_path=?, updated_at=datetime("now","localtime") WHERE block_key=?',
            (img, block_key)
        )
    return jsonify({'ok': True, 'image_path': img})


@app.route('/api/admin/homepage/<block_key>/image', methods=['DELETE'])
@require_admin
def api_delete_hp_image(block_key):
    if block_key not in VALID_HP_KEYS:
        return jsonify({'error': 'Неверный ключ блока'}), 400
    with get_db() as conn:
        row = conn.execute(
            'SELECT image_path FROM homepage_blocks WHERE block_key=?', (block_key,)
        ).fetchone()
        if row and row['image_path']:
            remove_image(row['image_path'])
        conn.execute(
            'UPDATE homepage_blocks SET image_path=NULL, updated_at=datetime("now","localtime") WHERE block_key=?',
            (block_key,)
        )
    return jsonify({'ok': True})


@app.route('/api/admin/homepage/<block_key>/images', methods=['POST'])
@require_admin
def api_add_hp_gallery_images(block_key):
    if block_key not in GALLERY_BLOCKS:
        return jsonify({'error': 'Этот блок не поддерживает галерею'}), 400
    saved = []
    for f in request.files.getlist('images'):
        path = save_image(f, f'hp_{block_key}')
        if path:
            saved.append(path)
    if not saved:
        return jsonify({'error': 'Нет допустимых изображений'}), 400
    with get_db() as conn:
        for path in saved:
            conn.execute(
                'INSERT INTO homepage_images (block_key, image_path) VALUES (?,?)',
                (block_key, path)
            )
    return jsonify({'ok': True, 'count': len(saved)})


@app.route('/api/admin/homepage/images/<int:iid>', methods=['PUT'])
@require_admin
def api_update_hp_gallery_image(iid):
    data = request.get_json(silent=True) or {}
    ratio = data.get('image_ratio', '3:2')
    if ratio not in ('3:2', '2:3', '3:1'):
        ratio = '3:2'
    with get_db() as conn:
        conn.execute('UPDATE homepage_images SET image_ratio=? WHERE id=?', (ratio, iid))
    return jsonify({'ok': True})


@app.route('/api/admin/homepage/images/<int:iid>', methods=['DELETE'])
@require_admin
def api_delete_hp_gallery_image(iid):
    with get_db() as conn:
        row = conn.execute(
            'SELECT image_path FROM homepage_images WHERE id=?', (iid,)
        ).fetchone()
        if row:
            remove_image(row['image_path'])
            conn.execute('DELETE FROM homepage_images WHERE id=?', (iid,))
    return jsonify({'ok': True})


# ─── Stats ─────────────────────────────────────────────────────────────────────

@app.route('/api/admin/stats')
@require_admin
def api_stats():
    with get_db() as conn:
        return jsonify({
            'courses': conn.execute('SELECT COUNT(*) FROM courses').fetchone()[0],
            'reviews': conn.execute('SELECT COUNT(*) FROM reviews').fetchone()[0],
            'enrollments': conn.execute('SELECT COUNT(*) FROM project_enrollments').fetchone()[0],
            'messages': conn.execute('SELECT COUNT(*) FROM messages').fetchone()[0],
            'unread': conn.execute('SELECT COUNT(*) FROM messages WHERE is_read=0').fetchone()[0],
            'news': conn.execute('SELECT COUNT(*) FROM news').fetchone()[0],
            'faq': conn.execute('SELECT COUNT(*) FROM faq').fetchone()[0],
            'blog': conn.execute('SELECT COUNT(*) FROM blog').fetchone()[0],
            'photos': conn.execute('SELECT COUNT(*) FROM photos').fetchone()[0],
            'projects': conn.execute('SELECT COUNT(*) FROM projects').fetchone()[0],
            'materials': conn.execute('SELECT COUNT(*) FROM materials').fetchone()[0],
        })


if __name__ == '__main__':
    init_db()
    # Безопасные значения по умолчанию: debug выключен, слушаем только localhost.
    # Для разработки: FLASK_DEBUG=1, при необходимости доступа из сети HOST=0.0.0.0.
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes', 'on')
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5000'))
    app.run(debug=debug, host=host, port=port)
