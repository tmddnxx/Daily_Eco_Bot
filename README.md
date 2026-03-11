# Morning Briefing Bot

매일 아침 한국/미국 주식, AI/Tech, 매크로 뉴스를 자동 수집하여 Claude CLI로 요약한 뒤 텔레그램으로 전송하는 봇입니다.

## 아키텍처

```
[뉴스 소스]          [처리]              [출력]
네이버 뉴스 ─┐
RSS 피드 ────┤→ Aggregator → Summarizer → Telegram Bot
Yahoo Finance┤   (중복제거)   (Claude CLI)   (폴링 모드)
웹 크롤링 ───┘

[스케줄링]
node-cron ──→ 매일 07:00 브리핑 전송
           └→ 30분마다 관심 키워드 체크
```

## 사전 준비

### 1. Node.js

Node.js 18 이상이 필요합니다.

```bash
node -v  # v18.0.0 이상 확인
```

### 2. Claude CLI

뉴스 요약에 Claude CLI를 사용합니다. 설치 후 인증이 완료되어 있어야 합니다.

```bash
claude -p "hello" --output-format text  # 정상 응답 확인
```

### 3. 텔레그램 봇 토큰

1. 텔레그램에서 [@BotFather](https://t.me/BotFather)에게 `/newbot` 명령
2. 봇 이름과 username 설정
3. 발급된 토큰을 복사

### 4. 네이버 검색 API (선택)

네이버 뉴스 수집을 사용하려면:

1. [네이버 개발자센터](https://developers.naver.com/apps/) 접속
2. 애플리케이션 등록 → 검색 API 선택
3. Client ID와 Client Secret 복사

> 네이버 API 없이도 RSS, Yahoo Finance, 웹 크롤링으로 동작합니다.
> `config.yaml`에서 `naver-news.enabled: false`로 비활성화하세요.

## 설치

```bash
cd /Users/dowhat/Downloads/morning-briefing

# 의존성 설치
npm install

# 환경변수 설정
cp .env .env
```

`.env` 파일을 열어 실제 값을 입력합니다:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
NAVER_CLIENT_ID=your-naver-client-id
NAVER_CLIENT_SECRET=your-naver-client-secret
```

## 설정 (config.yaml)

```yaml
schedule:
  time: "07:00"              # 매일 브리핑 전송 시간 (24시간 형식)
  timezone: "Asia/Seoul"     # 시간대

telegram:
  subscriberChatIds: []      # 브리핑 수신 대상 (비어있으면 누구나 사용 가능)
                             # 예: ["123456789", "987654321"]

summarizer:
  tool: "claude-cli"
  language: "ko"             # 요약 언어 (ko/en)
  briefingStyle: "concise"   # concise 또는 detailed
  dailyLimit: 50             # 하루 Claude CLI 호출 제한
  cacheDetailSummary: true   # 상세 요약 캐시 여부

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
    symbols: ["^GSPC", "^IXIC", "^KS11"]  # S&P500, NASDAQ, KOSPI
  web-scraper:
    enabled: true

watch:
  checkInterval: 30          # 관심 키워드 체크 간격 (분)
```

### 구독자 등록 방법

1. 봇을 실행한 상태에서 텔레그램에서 `/chatid` 입력
2. 봇이 응답한 Chat ID를 복사
3. `config.yaml`의 `subscriberChatIds`에 추가:
   ```yaml
   telegram:
     subscriberChatIds: ["123456789"]
   ```
4. 봇 재시작

> `subscriberChatIds`가 빈 배열이면 인증 없이 누구나 사용할 수 있습니다.
> 보안을 위해 본인의 Chat ID를 등록하는 것을 권장합니다.

## 실행

### 개발 모드 (로컬)

```bash
npm run dev
```

TypeScript를 직접 실행합니다 (tsx 사용). 로그가 콘솔에 실시간 출력됩니다.

### 프로덕션 모드

```bash
npm run build   # TypeScript → JavaScript 컴파일
npm start       # dist/index.js 실행
```

### macOS 백그라운드 서비스 (launchd)

로그인 시 자동 시작되고 크래시 시 자동 재시작되는 서비스로 등록합니다.

```bash
# 설치 (빌드 + launchd 등록)
./scripts/install-launchd.sh

# 상태 확인
./scripts/status-launchd.sh

# 재시작
./scripts/restart-launchd.sh

# 제거
./scripts/uninstall-launchd.sh
```

로그는 `logs/` 디렉토리에 저장됩니다:
- `logs/YYYY-MM-DD.log` — 앱 로그 (pino)
- `logs/bot-stdout.log` — launchd stdout
- `logs/bot-stderr.log` — launchd stderr

## 텔레그램 명령어

| 명령어 | 설명 |
|--------|------|
| `/now` | 지금 즉시 브리핑 생성 (모든 소스에서 실시간 수집) |
| `/search 키워드` | 키워드로 뉴스 검색 (캐시 우선, 없으면 실시간 수집) |
| `/market` | 주요 지수 실시간 시세 (S&P500, NASDAQ, KOSPI 등) |
| `/watch 키워드` | 관심 키워드 등록 (주기적으로 새 뉴스 알림) |
| `/unwatch 키워드` | 관심 키워드 해제 |
| `/watchlist` | 현재 관심 키워드 목록 확인 |
| `/history N` | 최근 N일치 브리핑 기록 (기본 3일, 최대 7일) |
| `/chatid` | 내 Chat ID 확인 (구독 등록에 필요) |
| `/settings` | 현재 봇 설정 확인 |
| `/help` | 명령어 도움말 |

### 브리핑 예시

```
📊 모닝 브리핑 | 2026.03.10 (화)

━━ 한국 주식 ━━
코스피가 외국인 매수세에 힘입어 1.2% 상승했으며,
삼성전자와 SK하이닉스가 반도체 수요 회복 기대감에 강세...

 1. 코스피 2,650선 돌파...외국인 3거래일 연속 순매수
 2. 삼성전자, HBM4 양산 앞당겨...주가 3% 상승

━━ 미국 주식 ━━
S&P 500이 AI 관련주 강세로 사상 최고치를 경신...

 3. S&P 500 5,230.50 (+0.59%)
 4. NASDAQ 16,450.20 (+0.82%)

━━ AI/Tech ━━
...
```

각 뉴스 항목에는 **[상세보기]** 버튼이 있어, 클릭하면 Claude CLI가 해당 뉴스의 상세 분석을 생성합니다.

## 뉴스 소스 커스터마이징

### RSS 피드 추가

`config.yaml`의 `sources.rss.feeds`에 추가:

```yaml
sources:
  rss:
    enabled: true
    feeds:
      - name: "한국경제"
        url: "https://www.hankyung.com/feed/all-news"
      - name: "조선비즈"
        url: "https://biz.chosun.com/rss/all.xml"
      - name: "TechCrunch"
        url: "https://techcrunch.com/feed/"
```

### Yahoo Finance 지수 추가

```yaml
sources:
  yahoo-finance:
    enabled: true
    symbols:
      - "^GSPC"    # S&P 500
      - "^IXIC"    # NASDAQ
      - "^KS11"    # KOSPI
      - "^KQ11"    # KOSDAQ
      - "^DJI"     # Dow Jones
```

### 소스 비활성화

특정 소스를 끄려면 `enabled: false`로 설정:

```yaml
sources:
  naver-news:
    enabled: false   # 네이버 API 키가 없을 때
  web-scraper:
    enabled: false   # 크롤링 불필요 시
```

## 테스트

```bash
# 전체 테스트 실행
npm test

# 감시 모드 (파일 변경 시 자동 재실행)
npm run test:watch
```

## 트러블슈팅

### 봇이 메시지에 응답하지 않음
- `.env`의 `TELEGRAM_BOT_TOKEN`이 올바른지 확인
- `subscriberChatIds`에 본인의 Chat ID가 포함되어 있는지 확인 (빈 배열이면 누구나 사용 가능)
- `/chatid` 명령어는 인증 없이 항상 동작합니다

### Claude CLI 요약이 생성되지 않음
- `claude -p "test" --output-format text` 명령이 정상 동작하는지 확인
- `/settings`에서 Claude CLI 잔여 호출 수 확인 (dailyLimit 초과 시 요약 생략)

### 네이버 뉴스가 수집되지 않음
- `.env`의 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 확인
- 네이버 개발자센터에서 애플리케이션 상태 확인

### launchd 서비스가 시작되지 않음
```bash
# 상태 확인
./scripts/status-launchd.sh

# 로그 확인
cat logs/bot-stderr.log

# 재설치
./scripts/uninstall-launchd.sh
./scripts/install-launchd.sh
```

## 기술 스택

| 기술 | 용도 |
|------|------|
| TypeScript | 타입 안전한 개발 |
| node-telegram-bot-api | 텔레그램 봇 API |
| axios | HTTP 클라이언트 |
| cheerio | 웹 스크래핑 |
| rss-parser | RSS 피드 파싱 |
| node-cron | 스케줄링 |
| pino | 로깅 |
| yaml | 설정 파일 파싱 |
| dotenv | 환경변수 관리 |
| vitest | 테스트 프레임워크 |
| launchd | macOS 프로세스 관리 |
