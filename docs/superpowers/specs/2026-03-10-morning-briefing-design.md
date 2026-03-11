# Morning Briefing - 설계 문서

매일 아침 한국/미국 주식시장, AI/Tech, 매크로 뉴스를 자동 수집하여 AI 요약 후 텔레그램으로 전송하는 프로젝트.

## 핵심 결정 사항

| 항목 | 결정 |
|------|------|
| 전달 방식 | 텔레그램 봇 |
| 뉴스 범위 | 한국주식, 미국주식, AI/Tech, 매크로/경제 |
| 수집 방식 | 무료 API + RSS + 웹 크롤링 혼합 |
| AI 요약 | Claude CLI |
| 상세보기 | 인라인 버튼 + 원문 링크 |
| 기술 스택 | Node.js + TypeScript |
| 실행 환경 | 로컬 맥 (launchd) |
| 저장소 | 로컬 JSON 파일 |

## 아키텍처

모듈러 파이프라인 방식. 수집 → 통합 → 요약 → 전송을 독립 모듈로 구성.

**실행 모델:** 텔레그램 봇은 명령어 수신을 위해 **상시 실행(KeepAlive)** 프로세스로 동작한다.
매일 브리핑과 `/watch` 감시는 봇 프로세스 내부에서 `node-cron`으로 스케줄링한다.
launchd는 봇 프로세스의 KeepAlive 관리만 담당 (단일 plist).

```
[launchd KeepAlive] → [Bot Process (상시 실행)]
                          ├── node-cron (07:00) → Collectors → Aggregator → Summarizer → 전송
                          ├── node-cron (30분) → Watch 키워드 체크 → 알림
                          └── Telegram Polling → 명령어 처리 (/now, /search, /watch ...)
```

## 프로젝트 구조

```
morning-briefing/
├── src/
│   ├── collectors/          # 뉴스 수집 모듈들
│   │   ├── naver-news.ts    # 네이버 검색 API (한국 주식/경제)
│   │   ├── rss-feed.ts      # RSS 피드 수집 (한경, 매경 등)
│   │   ├── yahoo-finance.ts # 미국 주식 데이터
│   │   └── web-scraper.ts   # 웹 크롤링 (API 없는 소스)
│   ├── aggregator.ts        # 수집된 뉴스 통합/중복 제거/정렬
│   ├── summarizer.ts        # Claude CLI로 AI 요약 생성
│   ├── bot/
│   │   └── telegram.ts      # 텔레그램 봇 (전송 + 상세보기 + 명령어)
│   ├── store/
│   │   ├── watchlist.json   # 관심 키워드 목록
│   │   ├── history.json     # 과거 브리핑 기록
│   │   └── sent-cache.json  # 중복 방지용 전송 기록
│   ├── config.ts            # 설정 로더
│   └── index.ts             # 메인 파이프라인 오케스트레이션
├── scripts/
│   ├── install-launchd.sh   # launchd plist 설치
│   ├── uninstall-launchd.sh # launchd plist 제거
│   └── status-launchd.sh    # launchd 상태 확인
├── launchd/
│   └── com.morning-briefing.bot.plist     # 봇 프로세스 KeepAlive
├── .env.example             # 환경변수 템플릿
├── .env                     # 실제 시크릿 (gitignore 대상)
├── .gitignore
├── logs/                    # 일별 실행 로그
├── config.yaml              # 사용자 설정 파일
├── package.json
└── tsconfig.json
```

## 핵심 인터페이스

```typescript
// 모든 Collector가 반환하는 공통 형태
interface NewsItem {
  id: string;              // sha256(source + url) — 중복 제거용 정규화 ID
  title: string;
  summary: string;        // 원문 요약 (1~2줄)
  url: string;            // 원문 링크
  source: string;         // 출처 (네이버, 한경, Yahoo 등)
  category: 'kr-stock' | 'us-stock' | 'ai-tech' | 'macro';
  publishedAt: Date;
}

// Claude CLI 요약 후 결과
interface BriefingSection {
  category: string;
  summary: string;         // 카테고리별 AI 요약 (3~5줄)
  items: NewsItem[];       // 개별 뉴스 목록
}
```

## 데이터 흐름

1. 스케줄러(launchd) → index.ts 실행
2. 모든 Collector 병렬 실행 → NewsItem[] 수집
3. Aggregator: 중복 제거 + 카테고리별 그룹핑
4. Summarizer: 카테고리별로 Claude CLI에 요약 요청
5. Telegram Bot: 요약 메시지 전송
   - 각 뉴스에 [상세보기] 인라인 버튼 + [원문] 링크
   - 버튼 클릭 시 → Claude CLI로 해당 뉴스 상세 요약 생성 후 전송

## 텔레그램 봇 명령어

| 명령어 | 설명 |
|--------|------|
| `/now` | 현재 시간 기준 최신 브리핑 즉시 받기 |
| `/search 키워드` | 특정 키워드로 뉴스 검색 |
| `/watch 키워드` | 관심 종목/키워드 등록 (실시간 알림) |
| `/unwatch 키워드` | 관심 종목/키워드 해제 |
| `/watchlist` | 현재 관심 목록 확인 |
| `/market` | 주요 지수 스냅샷 (코스피, 나스닥, 환율 등) |
| `/history N` | 최근 N일치 브리핑 다시 보기 |
| `/chatid` | 내 Chat ID 확인 (구독자 등록용) |
| `/settings` | 현재 설정 확인 (읽기 전용, v1.0) |
| `/help` | 명령어 목록 |

## 메시지 포맷 예시

```
📊 모닝 브리핑 | 2026.03.10 (화)

━━ 한국 주식 ━━
코스피 2,650 (+1.2%), 코스닥 870 (+0.8%)
외국인 3거래일 연속 순매수. 반도체·2차전지 강세.

 1. 삼성전자, 1분기 실적 컨센서스 상회 전망  [상세] [원문]
 2. SK하이닉스, HBM4 양산 일정 앞당겨       [상세] [원문]

━━ 미국 주식 ━━
S&P500 5,230 (+0.5%), 나스닥 16,800 (+0.9%)
엔비디아 신고가 경신. Fed 금리 인하 기대 유지.

 3. NVIDIA, 차세대 GPU 아키텍처 발표         [상세] [원문]
 4. Apple, AI 전략 대폭 수정 보도             [상세] [원문]

━━ AI/Tech ━━
...

━━ 매크로/경제 ━━
...
```

## 설정 파일 (config.yaml)

```yaml
schedule:
  time: "07:00"
  timezone: "Asia/Seoul"

telegram:
  # 구독자 chatId 목록 (다중 유저 지원). /chatid 명령어로 확인 후 추가.
  # 빈 배열이면 누구나 사용 가능, 값이 있으면 해당 chatId만 허용.
  subscriberChatIds: []

summarizer:
  tool: "claude-cli"
  language: "ko"
  briefingStyle: "concise"
  dailyLimit: 50           # Claude CLI 일일 호출 제한 (비용 관리)
  cacheDetailSummary: true # 상세보기 결과 캐싱 (동일 뉴스 재호출 방지)

sources:
  naver-news:
    enabled: true
    categories: ["주식", "경제", "AI"]
  rss:
    enabled: true
    feeds:
      - name: "한국경제"
        url: "https://www.hankyung.com/feed/all-news"
      - name: "매일경제"
        url: "https://www.mk.co.kr/rss/30000001/"
  yahoo-finance:
    enabled: true
    symbols: ["^GSPC", "^IXIC", "^KS11"]
  web-scraper:
    enabled: true

watch:
  checkInterval: 30  # 분 단위
```

## launchd 관리

봇 프로세스를 단일 KeepAlive 데몬으로 실행. 관리 스크립트 포함:

- `scripts/install-launchd.sh` — plist를 ~/Library/LaunchAgents/에 복사, launchctl bootstrap으로 등록
- `scripts/uninstall-launchd.sh` — launchctl bootout으로 해제, plist 파일 제거
- `scripts/status-launchd.sh` — 현재 등록 상태, 프로세스 PID, 로그 확인
- `scripts/restart-launchd.sh` — 봇 프로세스 재시작

단일 plist:
- `com.morning-briefing.bot.plist` — 봇 프로세스 상시 실행 (KeepAlive: true)
  - 프로세스 크래시 시 자동 재시작
  - stdout/stderr → logs/ 디렉토리로 리다이렉트

## 에러 처리

- Collector별 독립 실행 — 한 소스 실패해도 나머지 정상 수집
- 실패한 소스는 브리핑 메시지에 표시 (예: "⚠ 네이버 뉴스 수집 실패")
- Claude CLI 요약 실패 시 → 원문 요약 그대로 전달 (graceful fallback)
- HTTP 요청 재시도: 3회, 지수 백오프 (1초 → 2초 → 4초)
- 일별 로그 파일로 실행 기록 저장

## 데이터 보존 정책

- `sent-cache.json` — 30일 보존, 이후 자동 정리
- `history.json` — 90일 보존, 이후 자동 정리
- 파이프라인 실행 종료 시 정리 작업 수행

## 시크릿 관리

모든 민감 정보는 `.env` 파일에서 관리 (dotenv 사용):

```
TELEGRAM_BOT_TOKEN=your-bot-token
NAVER_CLIENT_ID=your-naver-client-id
NAVER_CLIENT_SECRET=your-naver-client-secret
```

구독자 chatId는 `.env`가 아닌 `config.yaml`의 `subscriberChatIds`에서 관리.
`/chatid` 명령어로 확인 후 추가.

- `.env`는 `.gitignore`에 포함
- `.env.example`에 키 이름만 기록하여 템플릿 제공
- `config.yaml`에는 시크릿을 직접 넣지 않음

## 뉴스 소스 상세

| 소스 | 방식 | 무료 여부 | 수집 대상 |
|------|------|-----------|-----------|
| 네이버 검색 API | REST API | 무료 (일 25,000건) | 한국 주식/경제/AI 뉴스 |
| RSS 피드 | RSS | 무료 | 한경, 매경 등 주요 언론 |
| Yahoo Finance | 비공식 API | 무료 | 미국 주식 지수/종목 데이터 (불안정할 수 있음) |
| Alpha Vantage (대안) | REST API | 무료 (일 25건) | Yahoo 실패 시 fallback |
| Finnhub (대안) | REST API | 무료 티어 | Yahoo 실패 시 fallback |
| 웹 크롤링 | HTTP + cheerio | 무료 | API 없는 소스 보완 |

## 주요 의존성

- `node-telegram-bot-api` — 텔레그램 봇
- `axios` — HTTP 요청
- `cheerio` — 웹 스크래핑 (HTML 파싱)
- `rss-parser` — RSS 피드 파싱
- `node-cron` — 브리핑/watch 스케줄링 (봇 프로세스 내부)
- `yaml` — 설정 파일 파싱
- `dotenv` — 환경변수 로드 (.env)
- `winston` 또는 `pino` — 로깅
