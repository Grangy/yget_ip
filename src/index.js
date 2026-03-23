#!/usr/bin/env node

import { Session, cloudApi, serviceClients, waitForOperation, decodeMessage } from '@yandex-cloud/nodejs-sdk';
import chalk from 'chalk';
import Table from 'cli-table3';
import figlet from 'figlet';
import ora from 'ora';
import boxen from 'boxen';
import dayjs from 'dayjs';
import { loadConfig, getSessionOptions } from './config.js';

const { ListAddressesRequest, CreateAddressRequest, GetAddressRequest, DeleteAddressRequest } = cloudApi.vpc.address_service;

const ZONES = ['ru-central1-a', 'ru-central1-b', 'ru-central1-d', 'ru-central1-e'];
const IP_PREFIXES = process.env.IP_PREFIXES
  ? process.env.IP_PREFIXES.split(',').map((s) => s.trim()).filter(Boolean)
  : ['51.250.', '158.160.'];

function matchesIp(ip) {
  return IP_PREFIXES.some((p) => ip.startsWith(p));
}
const HUNT = process.argv.includes('--hunt') || process.argv.includes('-h');
const SLOW = process.argv.includes('--slow') || process.argv.includes('-s');
const DIRECT = process.argv.includes('--direct') || process.argv.includes('-d');

const SLOW_ZONES = ['ru-central1-a', 'ru-central1-b'];
const SLOW_BATCH = 5;
const SLOW_INTERVAL_MS = 60 * 1000;

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || process.argv.find((a) => a.startsWith('--batch='))?.split('=')[1] || '15', 10) || 15;

async function fetchPublicAddresses(session, folderId) {
  const client = session.client(serviceClients.AddressServiceClient);
  const all = [];
  let pageToken = undefined;

  do {
    const res = await client.list(
      ListAddressesRequest.fromPartial({ folderId, pageSize: 100, pageToken })
    );
    all.push(...(res.addresses || []));
    pageToken = res.nextPageToken || undefined;
  } while (pageToken);

  return all;
}

function printBanner() {
  const art = figlet.textSync('GetWhiteIP', { font: 'Small' });
  console.log(chalk.cyan(art));
  console.log(
    chalk.gray('  Y☁C • Публичные IP • ') + chalk.yellow(IP_PREFIXES.join(', ')) + chalk.gray(' • ru-central1-{a,b,d,e}\n')
  );
}

function printResults(matching) {
  if (matching.length === 0) {
    console.log(boxen(chalk.yellow(`  Ни одного IP ${IP_PREFIXES.join(' / ')} не найдено  `), {
      padding: 1,
      borderColor: 'yellow',
      borderStyle: 'round',
    }));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('Имя'),
      chalk.cyan('ID'),
      chalk.cyan('Публичный IP'),
      chalk.cyan('Зона'),
      chalk.cyan('Статус'),
    ].map((h) => ({ content: h, hAlign: 'center' })),
    colWidths: [22, 28, 18, 16, 14],
    style: { head: [], border: ['cyan'] },
  });

  for (const addr of matching) {
    const ext = addr.externalIpv4Address || addr.external_ipv4_address;
    const ip = ext?.address || '';
    const zone = ext?.zoneId || ext?.zone_id || '-';
    const status = addr.used ? chalk.green('используется') : chalk.blue('свободен');
    table.push([
      chalk.white(addr.name || '-'),
      chalk.gray((addr.id || '-').slice(0, 24) + '...'),
      chalk.greenBright(ip),
      chalk.cyan(zone),
      status,
    ]);
  }

  console.log(table.toString());
  console.log(chalk.green(`\n  Найдено: ${matching.length}`));
  console.log(chalk.gray(`  Обновлено: ${dayjs().format('DD.MM.YYYY HH:mm:ss')}\n`));
}

function rand51_250() {
  return `51.250.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`;
}

async function createAndResolve(client, session, folderId, name, zoneIdOrAddress) {
  const spec = zoneIdOrAddress.includes('.')
    ? { address: zoneIdOrAddress }
    : { zoneId: zoneIdOrAddress };
  const op = await client.create(
    CreateAddressRequest.fromPartial({
      folderId,
      name,
      description: 'GetWhiteIP hunt',
      deletionProtection: false,
      externalIpv4AddressSpec: spec,
    })
  );
  const finished = await waitForOperation(op, session, 30000);
  if (finished.error) throw new Error(finished.error.message);
  let address;
  if (finished.response?.typeUrl) {
    address = decodeMessage(finished.response);
  } else {
    const meta = finished.metadata?.typeUrl ? decodeMessage(finished.metadata) : finished.metadata;
    const addrId = meta?.addressId;
    if (!addrId) throw new Error('Нет addressId в ответе');
    address = await client.get(GetAddressRequest.fromPartial({ addressId: addrId }));
  }
  return address;
}

async function deleteAddress(client, session, addressId) {
  const delOp = await client.delete(DeleteAddressRequest.fromPartial({ addressId }));
  if (delOp?.id) await waitForOperation(delOp, session, 15000).catch(() => {});
}

async function huntWhiteIp(session, folderId) {
  const client = session.client(serviceClients.AddressServiceClient);
  let batchNum = 0;
  let totalAttempts = 0;

  console.log(chalk.yellow(`  Батчи по ${BATCH_SIZE} — 4 зоны (a,b,d,e) параллельно\n`));

  while (true) {
    batchNum++;
    const base = Date.now();
    const tasks = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const zone = ZONES[i % ZONES.length];
      tasks.push({ name: `whiteip-${base}-${i}`, zoneIdOrAddress: zone });
    }

    try {
      process.stdout.write(chalk.gray(`  Батч [${batchNum}] создаю ${BATCH_SIZE} (a/b/d/e)... `));

      const results = await Promise.allSettled(
        tasks.map(({ name, zoneIdOrAddress }) => createAndResolve(client, session, folderId, name, zoneIdOrAddress))
      );

      const addresses = results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter(Boolean);

      totalAttempts += addresses.length;

      const winner = addresses.find((addr) => {
        const ext = addr.externalIpv4Address || addr.external_ipv4_address;
        return matchesIp(ext?.address || '');
      });

      const ipsWithZone = addresses.map((a) => {
        const ext = a.externalIpv4Address || a.external_ipv4_address;
        const ip = ext?.address || '?';
        const z = ext?.zoneId || ext?.zone_id || '?';
        return `${ip}(${z.slice(-1)})`;
      }).join(', ');
      console.log(chalk.cyan(ipsWithZone));

      if (winner) {
        const ext = winner.externalIpv4Address || winner.external_ipv4_address;
        const ip = ext?.address || '';
        const zone = ext?.zoneId || ext?.zone_id || '';
        const toDelete = addresses.filter((a) => a.id !== winner.id);
        await Promise.all(toDelete.map((a) => deleteAddress(client, session, a.id).catch(() => {})));
        console.log(chalk.green('\n✓ УСПЕХ!\n'));
        console.log(boxen(chalk.greenBright(`  🎯 Поймали: ${ip}\n  Зона: ${zone}\n  Имя: ${winner.name}\n  ID: ${winner.id}`), { padding: 1, borderColor: 'green', borderStyle: 'round' }));
        console.log(chalk.gray(`\n  Батчей: ${batchNum}, проверено IP: ${totalAttempts}\n`));
        return;
      }

      await Promise.all(addresses.map((a) => deleteAddress(client, session, a.id).catch(() => {})));
    } catch (e) {
      console.log(chalk.red(`Ошибка: ${e.message}`));
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function huntSlowIp(session, folderId) {
  const client = session.client(serviceClients.AddressServiceClient);
  let batchNum = 0;

  console.log(chalk.yellow(`  Режим --slow: зоны a+b, по ${SLOW_BATCH} IP, пауза ${SLOW_INTERVAL_MS / 1000} сек между батчами\n`));

  while (true) {
    batchNum++;
    const base = Date.now();
    const tasks = [];
    for (let i = 0; i < SLOW_BATCH; i++) {
      const zone = SLOW_ZONES[i % SLOW_ZONES.length];
      tasks.push({ name: `whiteip-${base}-${i}`, zoneIdOrAddress: zone });
    }

    try {
      process.stdout.write(chalk.gray(`  [${dayjs().format('HH:mm:ss')}] Батч ${batchNum}: создаю ${SLOW_BATCH} (a,b)... `));

      const results = await Promise.allSettled(
        tasks.map(async ({ name, zoneIdOrAddress }, i) => {
          await sleep(i * 800);
          return createAndResolve(client, session, folderId, name, zoneIdOrAddress);
        })
      );

      const addresses = results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter(Boolean);

      const winner = addresses.find((addr) => {
        const ext = addr.externalIpv4Address || addr.external_ipv4_address;
        return matchesIp(ext?.address || '');
      });

      const ipsWithZone = addresses.map((a) => {
        const ext = a.externalIpv4Address || a.external_ipv4_address;
        const ip = ext?.address || '?';
        const z = ext?.zoneId || ext?.zone_id || '?';
        return `${ip}(${z.slice(-1)})`;
      }).join(', ');
      console.log(chalk.cyan(ipsWithZone));

      if (winner) {
        const ext = winner.externalIpv4Address || winner.external_ipv4_address;
        const ip = ext?.address || '';
        const zone = ext?.zoneId || ext?.zone_id || '';
        const toDelete = addresses.filter((a) => a.id !== winner.id);
        await Promise.all(toDelete.map((a) => deleteAddress(client, session, a.id).catch(() => {})));
        console.log(chalk.green('\n✓ УСПЕХ!\n'));
        console.log(boxen(chalk.greenBright(`  🎯 Поймали: ${ip}\n  Зона: ${zone}\n  Имя: ${winner.name}\n  ID: ${winner.id}`), { padding: 1, borderColor: 'green', borderStyle: 'round' }));
        return;
      }

      await Promise.all(addresses.map((a) => deleteAddress(client, session, a.id).catch(() => {})));
    } catch (e) {
      console.log(chalk.red(`Ошибка: ${e.message}`));
    }

    process.stdout.write(chalk.gray(`  Ожидание ${SLOW_INTERVAL_MS / 1000} сек... `));
    await sleep(SLOW_INTERVAL_MS);
    console.log(chalk.gray('далее.\n'));
  }
}

async function huntDirectIp(session, folderId) {
  const client = session.client(serviceClients.AddressServiceClient);
  let batchNum = 0;
  const seen = new Set();

  console.log(chalk.yellow('  --direct: пробуем запросить конкретные IP 51.250.x.x (эксперимент)\n'));

  while (true) {
    batchNum++;
    const ips = [];
    while (ips.length < BATCH_SIZE) {
      const ip = rand51_250();
      if (!seen.has(ip)) {
        seen.add(ip);
        ips.push(ip);
      }
    }

    try {
      process.stdout.write(chalk.gray(`  Батч [${batchNum}] пробую ${ips.length} IP... `));

      const results = await Promise.allSettled(
        ips.map((ip, i) => createAndResolve(client, session, folderId, `whiteip-${Date.now()}-${i}`, ip))
      );

      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      if (ok.length > 0) {
        const winner = ok[0].value;
        const ip = (winner.externalIpv4Address || winner.external_ipv4_address)?.address || '';
        const toDelete = ok.slice(1).map((r) => r.value);
        await Promise.all(toDelete.map((a) => deleteAddress(client, session, a.id).catch(() => {})));
        console.log(chalk.green('✓ УСПЕХ!\n'));
        console.log(boxen(chalk.greenBright(`  🎯 Поймали: ${ip}\n  Имя: ${winner.name}\n  ID: ${winner.id}`), { padding: 1, borderColor: 'green', borderStyle: 'round' }));
        return;
      }

      const errs = [...new Set(failed.map((r) => r.reason?.message?.slice(0, 50) || '?'))];
      console.log(chalk.red(`${failed.length} fail: ${errs[0]}`));
    } catch (e) {
      console.log(chalk.red(`Ошибка: ${e.message}`));
    }
  }
}

async function main() {
  printBanner();

  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.error(chalk.red('Ошибка:'), e.message);
    process.exit(1);
  }

  const sessionOpts = getSessionOptions(config);
  const session = new Session(sessionOpts);

  try {
    if (DIRECT) {
      await huntDirectIp(session, config.YC_FOLDER_ID);
      return;
    }
    if (SLOW) {
      await huntSlowIp(session, config.YC_FOLDER_ID);
      return;
    }
    if (HUNT) {
      await huntWhiteIp(session, config.YC_FOLDER_ID);
      return;
    }

    const spinner = ora({ text: chalk.cyan('Запрос к API...'), color: 'cyan' }).start();
    const addresses = await fetchPublicAddresses(session, config.YC_FOLDER_ID);
    spinner.succeed(chalk.green(`Загружено публичных IP: ${addresses.length}`));

    const matching = addresses.filter((addr) => {
      const ext = addr.externalIpv4Address || addr.external_ipv4_address;
      const ip = ext?.address || '';
      const zone = ext?.zoneId || ext?.zone_id || '';
      return ZONES.includes(zone) && matchesIp(ip);
    });

    printResults(matching);
  } catch (err) {
    console.error(chalk.red(err.message || err));
    if (err.code === 16 || err.message?.includes('UNAUTHENTICATED')) {
      console.error(
        chalk.yellow('\n  Проверьте токен/ключ. Нужен IAM токен или authorized key (JSON).')
      );
    }
    process.exit(1);
  }
}

main();
