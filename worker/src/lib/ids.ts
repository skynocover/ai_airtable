/** 短 id 產生器:`<prefix>_<hex>`(預設 16 hex 字元)。用於 col_ / rec_ / op_ / fld_ 等資源 id。 */
function shortId(prefix: string, hexLength = 16): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, hexLength)}`;
}

export const newCollectionId = () => shortId("col");
export const newRecordId = () => shortId("rec");
export const newSchemaOpId = () => shortId("op");
export const newFieldId = () => shortId("fld", 12);
export const newChatSessionId = () => shortId("chat");
export const newChatMessageId = () => shortId("msg");
export const newActionId = () => shortId("act", 12);

/**
 * slug 保留字:這些 path 前綴由系統路由佔用(見 PLAN.md),collection slug 不可撞上,
 * 否則公開 path(如 /api、/f)會被 collection 蓋掉。
 */
export const RESERVED_SLUGS = new Set([
  "api",
  "f",
  "auth",
  "d",
  "t",
  "home",
  "c",
  "login",
  "sign-up",
  "settings",
]);

/** 由名稱產生 slug 基底:小寫、非英數轉連字號、去頭尾連字號、限長。 */
export function slugifyBase(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "collection";
}

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
