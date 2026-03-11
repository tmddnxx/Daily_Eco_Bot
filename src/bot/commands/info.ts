/**
 * 정보 명령어 (/chatid, /help, /history, /settings)
 *
 * - /chatid: 자신의 텔레그램 Chat ID를 확인 (구독 등록에 필요)
 * - /help: 사용 가능한 모든 명령어 목록 표시
 * - /history N: 최근 N일치 브리핑 기록 조회 (기본 3일, 최대 7일)
 * - /settings: 현재 봇 설정 확인 (읽기 전용, 변경은 config.yaml에서)
 */
import type { JsonStore } from '../../store/json-store.js';
import type { AppConfig } from '../../config.js';

export function handleChatId(chatId: number): string {
  return `🆔 당신의 Chat ID: \`${chatId}\`\n\n이 값을 config.yaml의 subscriberChatIds에 추가하면 매일 브리핑을 받을 수 있습니다.`;
}

export function handleHelp(): string {
  return `📖 명령어 목록

/now — 현재 시간 기준 최신 브리핑
/search 키워드 — 특정 키워드로 뉴스 검색
/watch 키워드 — 관심 키워드 등록 (정기 알림)
/unwatch 키워드 — 관심 키워드 해제
/watchlist — 현재 관심 목록 확인
/market — 주요 지수 스냅샷
/history N — 최근 N일치 브리핑 (기본 3일)
/chatid — 내 Chat ID 확인
/cancel — 진행 중인 작업 취소
/broadcast — 전체 구독자에게 브리핑 발송 (관리자 전용)
/settings — 현재 설정 확인
/help — 이 도움말`;
}

export function handleHistory(n: number, store: JsonStore): string {
  const count = Math.min(Math.max(n || 3, 1), 7);
  const history = store.getHistory(count);
  if (history.length === 0) {
    return '📂 저장된 브리핑이 없습니다.';
  }
  return history.map((h) => `📅 ${h.date}\n${h.content}`).join('\n\n---\n\n');
}

export function handleSettings(
  config: AppConfig,
  remainingCalls: number,
  watchCount: number,
): string {
  return [
    '⚙️ 현재 설정 (읽기 전용)',
    '',
    `⏰ 브리핑 시간: ${config.schedule.time}`,
    `🌏 시간대: ${config.schedule.timezone}`,
    `👥 구독자 수: ${config.telegram.subscriberChatIds.length}명`,
    `📊 Claude CLI 잔여 호출: ${remainingCalls}`,
    `👀 관심 키워드: ${watchCount}개`,
    '',
    '💡 설정 변경은 config.yaml 파일을 직접 수정하세요.',
  ].join('\n');
}
