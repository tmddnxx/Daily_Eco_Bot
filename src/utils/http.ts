/**
 * HTTP 재시도 유틸리티
 *
 * axios.get 요청을 지수 백오프(1s → 2s → 4s)로 최대 3회 재시도합니다.
 * 뉴스 수집 시 일시적인 네트워크 오류에 대응하기 위해 사용됩니다.
 */
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { logger } from '../logger.js';

interface RetryOptions {
  retries?: number;
  baseDelay?: number;
}

export async function fetchWithRetry(
  url: string,
  config: AxiosRequestConfig = {},
  options: RetryOptions = {}
): Promise<AxiosResponse> {
  const { retries = 3, baseDelay = 1000 } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      if (attempt === retries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(`⚠️ HTTP 요청 실패 (${attempt}회차) → ${delay}ms 후 재시도: ${url}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
