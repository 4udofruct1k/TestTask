/**
 * Точка входа для Yandex Cloud Functions: index.handler.
 *
 * Переменные окружения функции:
 *   HOUSEHOLD_KEY   — общий ключ двух телефонов, из «Создать код» в приложении
 *   DOCAPI_ENDPOINT — «Эндпоинт Document API» со страницы базы YDB
 *   TABLE           — имя таблицы, по умолчанию household
 * У функции должен быть сервисный аккаунт с ролью ydb.editor.
 */

import { docApiStore } from './docapi';
import { createHandler, type Response } from './handler';

declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(text: string, encoding: 'base64'): { toString(encoding: 'utf8'): string } };

interface CloudEvent {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

interface CloudContext {
  token?: { access_token?: string };
}

export async function handler(event: CloudEvent, context: CloudContext): Promise<Response> {
  const endpoint = process.env['DOCAPI_ENDPOINT'];
  const token = context.token?.access_token;
  const method = event.httpMethod ?? 'POST';

  if (method === 'POST' && (!endpoint || !token)) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        error: !endpoint
          ? 'В функции не задан DOCAPI_ENDPOINT'
          : 'У функции нет сервисного аккаунта: назначьте его в настройках версии',
      }),
    };
  }

  const run = createHandler({
    store: docApiStore({ endpoint: endpoint ?? '', table: process.env['TABLE'] || 'household', token: () => token ?? '' }),
    key: process.env['HOUSEHOLD_KEY'],
    today: () => new Date().toISOString().slice(0, 10),
  });

  const raw = event.body ?? '';
  const body = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  return run({ method, headers: event.headers ?? {}, body });
}
