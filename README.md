<div align="center">

# GetWhiteIP — охотник за «белыми» публичными IP в Yandex Cloud

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-scripts-CB3837?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/)
[![Yandex Cloud](https://img.shields.io/badge/Y%E2%98%81C-VPC%20%E2%80%A2%20Address%20API-5282FF?style=for-the-badge)](https://yandex.cloud/ru/docs/vpc/concepts/address)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](https://opensource.org/licenses/MIT)

<img src="https://skillicons.dev/icons?i=nodejs,npm" height="32" alt="Node.js, npm" />

**Стек:** Node.js · `@yandex-cloud/nodejs-sdk` (gRPC) · `chalk` · `cli-table3` · `figlet` · `ora` · `boxen` · `dayjs` · `dotenv` · `zod`

</div>

---

## Аннотация

Утилита для **поиска публичных статических IPv4** в каталоге Yandex Cloud с заданными префиксами (например `51.250.` и `158.160.`). Через **AddressService** создаёт адреса в выбранных зонах `ru-central1-*`, сравнивает выданный IP с префиксами, при совпадении оставляет ресурс, иначе удаляет. Поддержаны режимы **быстрого перебора** (`hunt`), **медленного** с паузами и ротацией зон (`slow`), опционально **DDoS protection** в спецификации адреса (`requirements.ddosProtectionProvider`), **preflight** create/delete перед циклом и экспериментальный `--direct`.

> **Безопасность:** не публикуйте IAM-токены, OAuth и JSON ключи сервисного аккаунта. Храните их в `.env` (в репозиторий не коммитится) или в переменных окружения CI. В примерах ниже вместо секретов — плейсхолдеры.

### Что улучшено в README (v1.1)

1. Аннотация и краткое описание алгоритма.  
2. Ряд бейджей и иконок стека в шапке.  
3. Оглавление с якорными ссылками.  
4. Примеры команд **без реальных ключей и folder-id** (только плейсхолдеры).  
5. Расширенная таблица переменных, включая `slow`, DDoS и preflight.  
6. Отдельный блок про квоты и типичные ошибки API.  
7. Таблица структуры репозитория.  
8. Акцент на том, что static access key (S3) не подходит для VPC.  
9. Ссылка на официальное описание поля `requirements` в REST API.  
10. Явное напоминание не коммитить ключи; в `.gitignore` расширены маски для `authorized_key*.json`.

---

## Содержание

- [Быстрый старт](#быстрый-старт)
- [Команды](#команды)
- [Примеры запуска из консоли](#примеры-запуска-из-консоли-без-секретов-в-команде)
- [Переменные окружения](#переменные-окружения)
- [Авторизация](#авторизация)
- [Квоты и типичные ошибки](#квоты-и-типичные-ошибки)
- [Файлы и `.gitignore`](#файлы-и-gitignore)

---

## Быстрый старт

```bash
git clone https://github.com/Grangy/yget_ip.git
cd yget_ip
npm install
cp .env.example .env
# Заполните .env: YC_FOLDER_ID и один способ авторизации (см. ниже)
npm run slow
```

---

## Команды

| Команда | Описание |
|--------|----------|
| `npm start` | Список уже существующих адресов с нужными префиксами в зонах a,b,d,e |
| `npm run hunt` | Быстрый режим: 4 зоны, `BATCH_SIZE` адресов на батч |
| `npm run slow` | Медленный режим: `SLOW_ZONES`, `SLOW_BATCH`, пауза `SLOW_INTERVAL_MS`, опционально DDoS и preflight |
| `npm run direct` | Эксперимент: запрос конкретного `51.250.x.x` (часто отклоняется API) |
| `npm run dev` | Тот же entrypoint под `nodemon` |

---

## Примеры запуска из консоли (без секретов в команде)

Рекомендуется положить путь к ключу и каталог в `.env`, а в терминале задавать только режим и опции охоты.

**Только префикс `51.250.` (остальное из `.env`):**

```bash
IP_PREFIXES=51.250. npm run slow
```

**Медленно: 1 IP за батч, ротация зон a → b → d, пауза 3 с, DDoS, preflight:**

```bash
SLOW_ZONES=ru-central1-a,ru-central1-b,ru-central1-d \
SLOW_BATCH=1 \
SLOW_INTERVAL_MS=3000 \
ENABLE_DDOS_PROTECTION=true \
DDOS_PROTECTION_PROVIDER=qrator \
SLOW_PREFLIGHT=true \
npm run slow
```

**Быстрый hunt, размер батча 10:**

```bash
BATCH_SIZE=10 IP_PREFIXES=51.250. npm run hunt
```

**Явно указать каталог и файл ключа (замените на свои значения, не копируйте чужие):**

```bash
YC_FOLDER_ID="<ваш-folder-id>" \
YC_SERVICE_ACCOUNT_KEY_FILE="/полный/путь/к/authorized_key.json" \
SLOW_ZONES=ru-central1-a \
SLOW_BATCH=1 \
npm run slow
```

**Только просмотр уже зарезервированных адресов:**

```bash
npm start
```

---

## Переменные окружения

Полный шаблон — в [`.env.example`](.env.example).

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `YC_FOLDER_ID` | Да | ID каталога |
| `YC_IAM_TOKEN` | Один из способов входа | Временный IAM-токен |
| `YC_SERVICE_ACCOUNT_KEY_FILE` | Один из способов входа | Путь к JSON авторизованного ключа SA |
| `YC_OAUTH_TOKEN` | Один из способов | OAuth (личный аккаунт) |
| `IP_PREFIXES` | Нет | Префиксы через запятую; по умолчанию `51.250.,158.160.` |
| `BATCH_SIZE` | Нет | Размер батча в `hunt` (по умолчанию 15) |
| `SLOW_ZONES` | Нет | Зоны для `--slow`, через запятую |
| `SLOW_BATCH` | Нет | Сколько адресов создавать за батч в `--slow` |
| `SLOW_INTERVAL_MS` | Нет | Пауза между батчами в мс (по умолчанию 60000) |
| `ENABLE_DDOS_PROTECTION` | Нет | `true` — в create передаётся `requirements.ddosProtectionProvider` |
| `DDOS_PROTECTION_PROVIDER` | Нет | Провайдер DDoS (по умолчанию `qrator`) |
| `SLOW_PREFLIGHT` | Нет | `true`/`false` — перед циклом один probe create+delete |

---

## Авторизация

### Static Access Key (YCA/YCP)

Не подходит для VPC Address API — нужен **IAM-токен** или **авторизованный ключ** сервисного аккаунта.

### IAM-токен

```bash
yc iam create-token
# Значение положите в .env как YC_IAM_TOKEN=... (не светите в скриншотах и логах)
```

### Авторизованный ключ (удобно для скриптов и CI)

1. Консоль Yandex Cloud → **IAM** → **Сервисные аккаунты**
2. SA с ролью `vpc.admin` или `editor` (по политике вашей организации)
3. **Создать авторизованный ключ** → скачать JSON
4. Файл **не коммитить**; в `.env`: `YC_SERVICE_ACCOUNT_KEY_FILE=authorized_key.json`

### Где взять `YC_FOLDER_ID`

- CLI: `yc config list` → `folder-id`
- Консоль: каталог → ID в URL (`.../folders/<folder-id>`)

---

## Квоты и типичные ошибки

- **`RESOURCE_EXHAUSTED` / `vpc.externalStaticAddresses.count`** — исчерпана квота статических внешних адресов в каталоге/облаке. Освободите неиспользуемые адреса или запросите лимит; уменьшите `SLOW_BATCH` или `BATCH_SIZE`.
- **`UNAUTHENTICATED`** — проверьте срок IAM-токена или корректность JSON-ключа и прав SA.
- **Нет «пойманного» префикса** — выдача IP псевдослучайна; скрипт лишь перебирает создание до совпадения с `IP_PREFIXES`.

---

## Файлы и `.gitignore`

| Путь | Назначение |
|------|------------|
| `src/index.js` | Логика режимов и работа с AddressService |
| `src/config.js` | Загрузка конфигурации и сессии SDK |
| `.env.example` | Шаблон переменных без секретов |
| `.env` | Локальные секреты (**в git не попадает**) |

В `.gitignore` игнорируются: `.env`, `node_modules`, шаблоны `*authorized_key*.json`, `*-key.json` и др.

---

## Ссылки

- [Публичные IP в VPC](https://yandex.cloud/ru/docs/vpc/concepts/address)
- [Создание IAM-токена для SA](https://cloud.yandex.com/en/docs/iam/operations/iam-token/create-for-sa)
- [REST: создание адреса (поля `requirements`)](https://github.com/yandex-cloud/docs/blob/master/en/vpc/api-ref/Address/create.md)

---

## Лицензия

MIT
