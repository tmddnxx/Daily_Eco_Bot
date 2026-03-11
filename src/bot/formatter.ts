/**
 * 텔레그램 메시지 포매터
 *
 * Briefing 객체를 텔레그램에 보낼 수 있는 텍스트로 변환합니다:
 * - formatBriefing(): 전체 브리핑을 카테고리별 섹션으로 포맷팅
 * - formatNewsDetail(): 개별 뉴스 상세보기 메시지 생성
 * - formatMarketSnapshot(): /market 명령어용 시장 현황 포맷
 * - getInlineKeyboard(): 뉴스별 [상세보기] [원문] 인라인 버튼 생성
 */
import type { Briefing, BriefingSection, NewsItem } from '../types.js';

const CATEGORY_LABELS: Record<string, string> = {
  'kr-stock': '한국 주식',
  'us-stock': '미국 주식',
  'ai-tech': 'AI/Tech',
  'macro': '매크로/경제',
};

const CATEGORY_ORDER = ['kr-stock', 'us-stock', 'ai-tech', 'macro'];

function formatDate(date: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const day = days[date.getDay()];
  return `${y}.${m}.${d} (${day})`;
}

export function formatBriefing(briefing: Briefing): string {
  const lines: string[] = [];

  lines.push(`📊 모닝 브리핑 | ${formatDate(briefing.date)}`);
  lines.push('');

  const sortedSections = [...briefing.sections].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );

  let itemIndex = 1;
  for (const section of sortedSections) {
    const label = CATEGORY_LABELS[section.category] || section.category;
    lines.push(`━━ ${label} ━━`);
    if (section.summary) {
      lines.push(section.summary);
    }
    lines.push('');

    for (const item of section.items) {
      lines.push(` ${itemIndex}. ${item.title}`);
      itemIndex++;
    }
    lines.push('');
  }

  if (briefing.errors.length > 0) {
    lines.push('⚠️ 수집 실패: ' + briefing.errors.join(', '));
  }

  return lines.join('\n').trim();
}

/** 텔레그램 메시지 길이 제한(4096자)에 맞춰 분할 */
export function splitMessage(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // 줄바꿈 기준으로 자르기
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = maxLength;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

export function formatNewsDetail(item: NewsItem, detail: string): string {
  const lines: string[] = [];
  lines.push(`📰 ${item.title}`);
  lines.push(`출처: ${item.source}`);
  lines.push('');
  lines.push(detail);
  lines.push('');
  lines.push(`🔗 원문: ${item.url}`);
  return lines.join('\n');
}

export function formatMarketSnapshot(items: NewsItem[]): string {
  const lines: string[] = [];
  lines.push('📈 시장 현황');
  lines.push('');
  for (const item of items) {
    lines.push(`• ${item.title}`);
  }
  return lines.join('\n');
}

export function getInlineKeyboard(items: NewsItem[]): Array<Array<{ text: string; callback_data?: string; url?: string }>> {
  const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // 제목을 최대 25자로 잘라서 버튼에 표시
    const shortTitle = item.title.length > 25 ? item.title.slice(0, 24) + '…' : item.title;
    keyboard.push([
      { text: `🔍 ${i + 1}. ${shortTitle}`, callback_data: `detail:${item.id}` },
      { text: `🔗 원문`, url: item.url },
    ]);
  }

  return keyboard;
}
