/**
 * 관심 키워드 명령어 (/watch, /unwatch, /watchlist)
 *
 * 사용자가 관심 키워드를 등록하면 주기적으로(기본 30분) 해당 키워드가
 * 포함된 뉴스가 새로 수집될 때 텔레그램으로 알림을 보냅니다.
 */
import type { JsonStore } from '../../store/json-store.js';

export function handleWatch(keyword: string, store: JsonStore): string {
  if (!keyword.trim()) {
    return '⚠️ 키워드를 입력해주세요. 예: /watch 삼성전자';
  }
  store.addWatch(keyword.trim());
  return `✅ "${keyword.trim()}" 관심 목록에 추가했습니다.`;
}

export function handleUnwatch(keyword: string, store: JsonStore): string {
  if (!keyword.trim()) {
    return '⚠️ 키워드를 입력해주세요. 예: /unwatch 삼성전자';
  }
  store.removeWatch(keyword.trim());
  return `🗑️ "${keyword.trim()}" 관심 목록에서 제거했습니다.`;
}

export function handleWatchlist(store: JsonStore): string {
  const list = store.getWatchlist();
  if (list.length === 0) {
    return '📋 관심 목록이 비어있습니다. /watch 키워드 로 추가하세요.';
  }
  return '📋 관심 목록:\n' + list.map((k, i) => `${i + 1}. ${k}`).join('\n');
}
