/** Public match chat room id — must match server.js Socket.IO validation */
export const CHAT_ID_PATTERN = /^[\p{L}\p{N}_\s:-]{1,64}$/u;

export const MAX_CHAT_MSG_LEN = 1000;

/** Avoid ReDoS / accidental regex syntax when building User.find RegExp from query */
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Sorted pair of usernames → private chat document id (same as frontend) */
export function privateChatIdForUsers(userA, userB) {
  return [userA, userB].sort((a, b) => a.localeCompare(b, 'pl')).join('_');
}
