const URL_PATTERN = /https?:\/\/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;

/**
 * 从文本中提取第一个 HTTP/HTTPS URL。
 * 用于处理抖音/小红书等平台的分享文案，其中 URL 混在大量文字中。
 */
export function extractUrl(text: string): string | null {
  const matches = text.match(URL_PATTERN);
  return matches?.[0] ?? null;
}
