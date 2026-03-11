import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithRetry } from '../../src/utils/http.js';

vi.mock('axios');
import axios from 'axios';

const mockedAxios = vi.mocked(axios);

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return data on first successful attempt', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: { result: 'ok' } });
    const result = await fetchWithRetry('https://example.com');
    expect(result.data).toEqual({ result: 'ok' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    mockedAxios.get = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: { result: 'ok' } });

    const result = await fetchWithRetry('https://example.com', {}, { retries: 3, baseDelay: 0 });
    expect(result.data).toEqual({ result: 'ok' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should throw after all retries exhausted', async () => {
    mockedAxios.get = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(
      fetchWithRetry('https://example.com', {}, { retries: 3, baseDelay: 0 })
    ).rejects.toThrow('timeout');
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });
});
