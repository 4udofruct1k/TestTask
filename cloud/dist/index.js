var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// cloud/src/index.ts
var index_exports = {};
__export(index_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(index_exports);

// src/household/days.ts
function toDays(date) {
  let y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function fromDays(days) {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function addDays(date, n) {
  return fromDays(toDays(date) + n);
}

// src/household/apply.ts
var APPLIED_KEEP = 500;
var HISTORY_DAYS = 21;
var MAX_AMOUNT = 1e5;
function emptyState() {
  return { rev: 0, stock: {}, purchases: {}, cooking: {}, applied: [] };
}
var PEOPLE = ["max", "ilvina"];
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var PRODUCT_RE = /^[a-z][a-z0-9_-]{0,31}$/;
var finite = (v) => typeof v === "number" && Number.isFinite(v);
function isEvent(raw) {
  if (typeof raw !== "object" || raw === null) return false;
  const e = raw;
  if (typeof e["id"] !== "string" || e["id"].length < 8 || e["id"].length > 64) return false;
  if (typeof e["at"] !== "string" || e["at"].length > 40) return false;
  if (!PEOPLE.includes(e["who"])) return false;
  if (typeof e["product"] !== "string" || !PRODUCT_RE.test(e["product"])) return false;
  if (e["type"] === "purchase" || e["type"] === "cook") {
    return typeof e["date"] === "string" && DATE_RE.test(e["date"]) && finite(e["delta"]) && Math.abs(e["delta"]) <= MAX_AMOUNT;
  }
  if (e["type"] === "stock") return finite(e["value"]) && e["value"] >= 0 && e["value"] <= MAX_AMOUNT;
  return false;
}
var round = (v) => Math.round(v * 100) / 100;
function setOrDelete(obj, key, value) {
  if (value > 0) obj[key] = value;
  else delete obj[key];
}
function applyEvent(state, event) {
  if (state.applied.includes(event.id)) return state;
  const stock = { ...state.stock };
  const purchases = { ...state.purchases };
  const cooking = { ...state.cooking };
  const have = stock[event.product] ?? 0;
  if (event.type === "purchase") {
    const day = { ...purchases[event.date] ?? {} };
    const mine = { ...day[event.product] ?? {} };
    const before = mine[event.who] ?? 0;
    const after = Math.max(0, round(before + event.delta));
    const change = after - before;
    if (after > 0) mine[event.who] = after;
    else delete mine[event.who];
    if (Object.keys(mine).length > 0) day[event.product] = mine;
    else delete day[event.product];
    if (Object.keys(day).length > 0) purchases[event.date] = day;
    else delete purchases[event.date];
    setOrDelete(stock, event.product, round(Math.max(0, have + change)));
  } else if (event.type === "cook") {
    const day = { ...cooking[event.date] ?? {} };
    const before = day[event.product] ?? 0;
    const after = Math.max(0, round(before + event.delta));
    const change = after - before;
    setOrDelete(day, event.product, after);
    if (Object.keys(day).length > 0) cooking[event.date] = day;
    else delete cooking[event.date];
    setOrDelete(stock, event.product, round(Math.max(0, have - change)));
  } else {
    setOrDelete(stock, event.product, round(event.value));
  }
  const applied = [...state.applied, event.id];
  return {
    rev: state.rev + 1,
    stock,
    purchases,
    cooking,
    applied: applied.length > APPLIED_KEEP ? applied.slice(applied.length - APPLIED_KEEP) : applied
  };
}
function applyEvents(state, events) {
  let next = state;
  for (const event of events) next = applyEvent(next, event);
  return { state: next, acked: events.map((e) => e.id) };
}
function prune(state, today) {
  const cutoff = addDays(today, -HISTORY_DAYS);
  const keep = (rec) => Object.fromEntries(Object.entries(rec).filter(([date]) => date >= cutoff));
  return { ...state, purchases: keep(state.purchases), cooking: keep(state.cooking) };
}
function isState(raw) {
  if (typeof raw !== "object" || raw === null) return false;
  const s = raw;
  const isRec = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  return finite(s["rev"]) && isRec(s["stock"]) && isRec(s["purchases"]) && isRec(s["cooking"]) && Array.isArray(s["applied"]);
}

// cloud/src/docapi.ts
var ITEM_ID = "household";
var DocApiError = class extends Error {
  constructor(message, type) {
    super(message);
    this.type = type;
  }
};
function docApiStore({ endpoint, table, token, fetch: send = fetch }) {
  async function call(action, payload) {
    const response = await send(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": `DynamoDB_20120810.${action}`,
        Authorization: `Bearer ${token()}`
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
    }
    if (!response.ok) {
      const type = String(data["__type"] ?? "").split("#").pop() ?? "";
      const message = String(data["message"] ?? data["Message"] ?? text ?? response.statusText);
      throw new DocApiError(`${action}: ${type || response.status} ${message}`.trim(), type);
    }
    return data;
  }
  let tableChecked = false;
  async function ensureTable() {
    await call("CreateTable", {
      TableName: table,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }]
    }).catch((error) => {
      if (error instanceof DocApiError && error.type === "ResourceInUseException") return;
      throw error;
    });
    tableChecked = true;
  }
  async function getItem() {
    try {
      return await call("GetItem", { TableName: table, Key: { id: { S: ITEM_ID } } });
    } catch (error) {
      if (tableChecked || !(error instanceof DocApiError) || error.type !== "ResourceNotFoundException") throw error;
      await ensureTable();
      return call("GetItem", { TableName: table, Key: { id: { S: ITEM_ID } } });
    }
  }
  return {
    async load() {
      const data = await getItem();
      tableChecked = true;
      const item = data["Item"];
      if (!item?.body?.S) return null;
      const state = JSON.parse(item.body.S);
      if (!isState(state)) throw new Error("\u0412 \u0431\u0430\u0437\u0435 \u043B\u0435\u0436\u0438\u0442 \u0437\u0430\u043F\u0438\u0441\u044C \u043D\u0435\u043F\u043E\u043D\u044F\u0442\u043D\u043E\u0433\u043E \u0432\u0438\u0434\u0430");
      return state;
    },
    async save(state, expectedRev) {
      const condition = expectedRev === null ? { ConditionExpression: "attribute_not_exists(#id)", ExpressionAttributeNames: { "#id": "id" } } : {
        ConditionExpression: "#v = :v",
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: { ":v": { N: String(expectedRev) } }
      };
      try {
        await call("PutItem", {
          TableName: table,
          Item: { id: { S: ITEM_ID }, version: { N: String(state.rev) }, body: { S: JSON.stringify(state) } },
          ...condition
        });
        return true;
      } catch (error) {
        if (error instanceof DocApiError && error.type === "ConditionalCheckFailedException") return false;
        throw error;
      }
    }
  };
}

// src/household/sync.ts
var KEY_HEADER = "X-Household-Key";

// cloud/src/handler.ts
var ATTEMPTS = 5;
var MAX_EVENTS = 1e3;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": `Content-Type, ${KEY_HEADER}`,
  "Access-Control-Max-Age": "86400"
};
var json = (statusCode, data) => ({
  statusCode,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(data)
});
function sameKey(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function header(headers, name) {
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === wanted) return v;
  return void 0;
}
function createHandler({ store, key, today }) {
  return async (request) => {
    if (request.method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
    if (request.method === "GET") return json(200, { ok: true, service: "household" });
    if (request.method !== "POST") return json(405, { error: "\u041D\u0443\u0436\u0435\u043D POST" });
    if (!key || key.length < 16) {
      return json(500, { error: "\u0412 \u0444\u0443\u043D\u043A\u0446\u0438\u0438 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D \u043A\u043B\u044E\u0447: \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F HOUSEHOLD_KEY" });
    }
    const given = header(request.headers, KEY_HEADER) ?? "";
    if (!sameKey(given, key)) return json(403, { error: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043B\u044E\u0447" });
    let raw;
    try {
      raw = JSON.parse(request.body || "{}");
    } catch {
      return json(400, { error: "\u0422\u0435\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u2014 \u043D\u0435 JSON" });
    }
    const list = raw.events;
    if (!Array.isArray(list) || list.length > MAX_EVENTS) return json(400, { error: "\u041D\u0435\u0442 \u0441\u043F\u0438\u0441\u043A\u0430 \u0441\u043E\u0431\u044B\u0442\u0438\u0439" });
    const events = list.filter(isEvent);
    const acked = list.map((e) => typeof e === "object" && e !== null ? e.id : void 0).filter((id) => typeof id === "string");
    try {
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const stored = await store.load();
        const base = stored ?? emptyState();
        const applied = applyEvents(base, events).state;
        const next = prune(applied, today());
        if (stored !== null && next.rev === stored.rev) return json(200, { state: next, acked });
        if (await store.save(next, stored === null ? null : stored.rev)) return json(200, { state: next, acked });
      }
      return json(503, { error: "\u0411\u0430\u0437\u0430 \u0437\u0430\u043D\u044F\u0442\u0430, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437" });
    } catch (error) {
      return json(502, { error: error instanceof Error ? error.message : "\u0411\u0430\u0437\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430" });
    }
  };
}

// cloud/src/index.ts
async function handler(event, context) {
  const endpoint = process.env["DOCAPI_ENDPOINT"];
  const token = context.token?.access_token;
  const method = event.httpMethod ?? "POST";
  if (method === "POST" && (!endpoint || !token)) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: !endpoint ? "\u0412 \u0444\u0443\u043D\u043A\u0446\u0438\u0438 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D DOCAPI_ENDPOINT" : "\u0423 \u0444\u0443\u043D\u043A\u0446\u0438\u0438 \u043D\u0435\u0442 \u0441\u0435\u0440\u0432\u0438\u0441\u043D\u043E\u0433\u043E \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430: \u043D\u0430\u0437\u043D\u0430\u0447\u044C\u0442\u0435 \u0435\u0433\u043E \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0432\u0435\u0440\u0441\u0438\u0438"
      })
    };
  }
  const run = createHandler({
    store: docApiStore({ endpoint: endpoint ?? "", table: process.env["TABLE"] || "household", token: () => token ?? "" }),
    key: process.env["HOUSEHOLD_KEY"],
    today: () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  });
  const raw = event.body ?? "";
  const body = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  return run({ method, headers: event.headers ?? {}, body });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
