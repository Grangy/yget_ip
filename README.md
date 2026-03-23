# GetWhiteIP — Y☁C IP Hunter

Автоматический поиск публичных IP адресов **51.250.*** и **158.160.*** в Y☁C. Создаёт IP в указанных зонах, проверяет префикс, оставляет нужные — удаляет остальные.

## Быстрый старт

```bash
git clone <repo>
cd getwhiteip-yandex
npm install
cp .env.example .env
# Заполните .env (YC_FOLDER_ID и авторизацию)
npm run slow
```

## Режимы работы

| Команда | Описание |
|---------|----------|
| `npm start` | Показать уже зарезервированные IP (51.250.* / 158.160.*) |
| `npm run hunt` | Быстрый перебор: 4 зоны, 15 IP на батч, без пауз |
| `npm run slow` | Медленный: зоны a+b, 5 IP, пауза 60 сек между батчами |
| `npm run direct` | Эксперимент: попытка запросить конкретный IP (обычно INVALID) |
| `npm run dev` | Запуск с nodemon |

## Переменные окружения

См. `.env.example`. Основные:

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `YC_FOLDER_ID` | Да | ID каталога Y☁C |
| `YC_IAM_TOKEN` | Или | Токен от `yc iam create-token` |
| `YC_SERVICE_ACCOUNT_KEY_FILE` | Или | Путь к JSON авторизованного ключа |
| `YC_OAUTH_TOKEN` | Или | OAuth-токен |
| `IP_PREFIXES` | Нет | Префиксы через запятую (по умолчанию: 51.250., 158.160.) |
| `BATCH_SIZE` | Нет | IP на батч в режиме hunt (по умолчанию: 15) |

**Охота только за 51.250.***:
```bash
IP_PREFIXES=51.250. npm run slow
```

## Авторизация

### Static Access Key (YCA/YCP) — не подходит

Статический ключ используется только для Object Storage (S3). Для VPC/Address API нужен IAM токен или авторизованный ключ.

### Вариант 1: IAM токен

```bash
yc iam create-token
# В .env: YC_IAM_TOKEN=t1.9euelZr...
```

### Вариант 2: Авторизованный ключ (рекомендуется для CI)

1. Консоль Y☁C → **IAM** → **Сервисные аккаунты**
2. Выберите SA с ролью `vpc.admin` или `editor`
3. **Создать авторизованный ключ** → Скачать JSON
4. Сохранить как `authorized_key.json` в корне проекта
5. В `.env`: `YC_SERVICE_ACCOUNT_KEY_FILE=authorized_key.json`

### ID каталога

- CLI: `yc config list` → `folder-id`
- Консоль: выберите каталог → ID в URL: `.../folders/b1g...`

## Зоны и префиксы

- **Зоны (hunt):** ru-central1-a, b, d, e
- **Зоны (slow):** ru-central1-a, b
- **Префиксы по умолчанию:** 51.250., 158.160.

## Файлы в .gitignore

- `.env` — переменные и секреты
- `authorized_key.json`, `sa-key.json`, `*-key.json` — ключи доступа
- `node_modules/` — зависимости

## Требования

- Node.js >= 18
- Y☁C каталог с сервисным аккаунтом

## Ссылки

- [Y☁C VPC — публичные адреса](https://yandex.cloud/ru/docs/vpc/concepts/address)
- [IAM — авторизованный ключ](https://cloud.yandex.com/en/docs/iam/operations/iam-token/create-for-sa)
