/**
 * 로거 설정
 *
 * pino 로거를 사용하여 콘솔(pino-pretty)과 파일(logs/YYYY-MM-DD.log)에 동시 출력합니다.
 * 콘솔에는 한국어 + 이모지로 보기 쉽게, 파일에는 JSON 원본을 저장합니다.
 * LOG_LEVEL 환경변수로 로그 레벨 조정 가능 (기본: info).
 */
import pino from 'pino';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const logDir = join(import.meta.dirname, '..', 'logs');
mkdirSync(logDir, { recursive: true });

// 한국 시간 기준 날짜
const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          destination: 1,
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
        },
      },
      { target: 'pino/file', options: { destination: join(logDir, `${today}.log`) } },
    ],
  },
});
