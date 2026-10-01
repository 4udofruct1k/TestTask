/**
 * Хранение общего состояния в YDB через Document API — DynamoDB-совместимый
 * HTTP-интерфейс. Без SDK: два вызова, GetItem и PutItem, обычным fetch.
 * Вход — IAM-токен сервисного аккаунта функции: статических ключей
 * заводить не нужно.
 *
 * Всё состояние — одна запись: ключ id = "household", версия и JSON.
 */

import { isState } from '../../src/household/apply';
import type { HouseholdState } from '../../src/household/types';
import type { StateStore } from './handler';

export interface DocApiOptions {
  /** «Эндпоинт Document API» со страницы базы */
  endpoint: string;
  table: string;
  /** IAM-токен: функция получает его в context.token */
  token: () => string;
  fetch?: typeof fetch;
}

const ITEM_ID = 'household';

export class DocApiError extends Error {
  constructor(
    message: string,
    readonly type: string,
  ) {
    super(message);
  }
}

export function docApiStore({ endpoint, table, token, fetch: send = fetch }: DocApiOptions): StateStore {
  async function call(action: string, payload: unknown): Promise<Record<string, unknown>> {
    const response = await send(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'X-Amz-Target': `DynamoDB_20120810.${action}`,
        Authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ответ не JSON — сообщение ниже возьмёт текст как есть
    }
    if (!response.ok) {
      const type = String(data['__type'] ?? '').split('#').pop() ?? '';
      const message = String(data['message'] ?? data['Message'] ?? text ?? response.statusText);
      throw new DocApiError(`${action}: ${type || response.status} ${message}`.trim(), type);
    }
    return data;
  }

  let tableChecked = false;

  /** Таблицы нет — создать. Нужна роль ydb.editor; без неё — понятная ошибка. */
  async function ensureTable(): Promise<void> {
    await call('CreateTable', {
      TableName: table,
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    }).catch((error: unknown) => {
      if (error instanceof DocApiError && error.type === 'ResourceInUseException') return;
      throw error;
    });
    tableChecked = true;
  }

  async function getItem(): Promise<Record<string, unknown>> {
    try {
      return await call('GetItem', { TableName: table, Key: { id: { S: ITEM_ID } } });
    } catch (error) {
      if (tableChecked || !(error instanceof DocApiError) || error.type !== 'ResourceNotFoundException') throw error;
      await ensureTable();
      return call('GetItem', { TableName: table, Key: { id: { S: ITEM_ID } } });
    }
  }

  return {
    async load() {
      const data = await getItem();
      tableChecked = true;
      const item = data['Item'] as { body?: { S?: string } } | undefined;
      if (!item?.body?.S) return null;
      const state: unknown = JSON.parse(item.body.S);
      if (!isState(state)) throw new Error('В базе лежит запись непонятного вида');
      return state;
    },

    async save(state: HouseholdState, expectedRev: number | null) {
      const condition =
        expectedRev === null
          ? { ConditionExpression: 'attribute_not_exists(#id)', ExpressionAttributeNames: { '#id': 'id' } }
          : {
              ConditionExpression: '#v = :v',
              ExpressionAttributeNames: { '#v': 'version' },
              ExpressionAttributeValues: { ':v': { N: String(expectedRev) } },
            };
      try {
        await call('PutItem', {
          TableName: table,
          Item: { id: { S: ITEM_ID }, version: { N: String(state.rev) }, body: { S: JSON.stringify(state) } },
          ...condition,
        });
        return true;
      } catch (error) {
        if (error instanceof DocApiError && error.type === 'ConditionalCheckFailedException') return false;
        throw error;
      }
    },
  };
}
