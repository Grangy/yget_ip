import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const env = dotenv.config();
dotenvExpand.expand(env);

const EnvSchema = z.object({
  YC_IAM_TOKEN: z.string().optional(),
  YC_OAUTH_TOKEN: z.string().optional(),
  YC_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
  YC_FOLDER_ID: z.string().min(1, 'YC_FOLDER_ID обязателен'),
  YC_ZONE: z.string().default('ru-central1-a'),
  IP_PREFIX: z.string().optional(),
  IP_PREFIXES: z.string().optional(),
});

function loadConfig() {
  const raw = {
    YC_IAM_TOKEN: process.env.YC_IAM_TOKEN,
    YC_OAUTH_TOKEN: process.env.YC_OAUTH_TOKEN,
    YC_SERVICE_ACCOUNT_KEY_FILE: process.env.YC_SERVICE_ACCOUNT_KEY_FILE,
    YC_FOLDER_ID: process.env.YC_FOLDER_ID,
    YC_ZONE: process.env.YC_ZONE,
    IP_PREFIX: process.env.IP_PREFIX,
    IP_PREFIXES: process.env.IP_PREFIXES,
  };

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Ошибка конфигурации:\n${msg}`);
  }

  const data = parsed.data;
  if (data.IP_PREFIXES) {
    data.ipPrefixes = data.IP_PREFIXES.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (data.IP_PREFIX) {
    data.ipPrefixes = [data.IP_PREFIX];
  } else {
    data.ipPrefixes = ['51.250.', '158.160.'];
  }
  return data;
}

function getSessionOptions(config) {
  if (config.YC_IAM_TOKEN) {
    return { iamToken: config.YC_IAM_TOKEN };
  }
  if (config.YC_OAUTH_TOKEN) {
    return { oauthToken: config.YC_OAUTH_TOKEN };
  }
  if (config.YC_SERVICE_ACCOUNT_KEY_FILE) {
    const path = resolve(process.cwd(), config.YC_SERVICE_ACCOUNT_KEY_FILE);
    if (!existsSync(path)) {
      throw new Error(`Файл ключа не найден: ${path}`);
    }
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const key = json.private_key || json.privateKey || '';
    const privateKey = key.replace(/^.*-----BEGIN PRIVATE KEY-----/s, '-----BEGIN PRIVATE KEY-----');
    const credentials = {
      serviceAccountId: json.service_account_id || json.serviceAccountId,
      accessKeyId: json.id,
      privateKey,
    };
    return { serviceAccountJson: credentials };
  }
  throw new Error(
    'Укажите один из способов авторизации: YC_IAM_TOKEN, YC_OAUTH_TOKEN или YC_SERVICE_ACCOUNT_KEY_FILE'
  );
}

export { loadConfig, getSessionOptions };
