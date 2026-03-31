@AGENTS.md

# 주식 분석 도구 — Claude Code 가이드

## 프로젝트 개요
Next.js 15 + TypeScript 기반 주식 분석 웹앱.
한국(KOSPI/KOSDAQ)과 미국(NYSE/NASDAQ) 주식의 재무제표·차트·지표를 분석하며,
**Lego Brick 구조**로 모든 분석 기능이 독립 플러그인으로 존재한다.
AI 에이전트가 자연어 프롬프트를 받아 새 Brick을 실시간으로 생성·추가할 수 있다.

## 개발 서버
```bash
cd E:/n_pj/stock-analyzer
npm run dev        # http://localhost:3000
npx tsc --noEmit   # 타입 검사
```

## 핵심 아키텍처: Brick 시스템

### Brick 디렉토리 구조
```
src/bricks/
  registry.json                  ← 전체 Brick 목록 (enabled/order 관리)
  {brick-id}/
    manifest.json                ← Brick 메타정보 (id, name, category, author)
    component.tsx                ← React UI 컴포넌트 (BrickProps 수신)
    api.ts                       ← 데이터 fetch (선택)
    calculations.ts              ← 계산 공식 (선택)
    index.ts                     ← barrel export
```

### Brick 규칙 (반드시 준수)
- Brick은 다른 Brick 디렉토리에서 import 금지
- 모든 Brick 컴포넌트는 `BrickProps { ticker, market, data? }` 를 props로 받음
- `author: "system"` Brick은 삭제 불가 (비활성화만 가능)
- AI 생성 Brick은 `author: "ai-agent"` 로 표시

### Brick 카테고리
| category | 용도 |
|----------|------|
| `calculation` | 지표 계산 (PER, EPS 등) |
| `chart` | Recharts 시각화 |
| `research` | 외부 데이터 조회 |
| `table` | 데이터 테이블 |
| `alert` | 조건 알림 |

### 기본 설치 Brick
| ID | 이름 | 카테고리 |
|----|------|---------|
| `financial-statements` | 재무제표 | table |
| `interactive-chart` | 재무 차트 | chart |
| `metrics-calculator` | 투자 지표 계산기 | calculation |
| `news` | 관련 뉴스 | research |

## 파일 구조 요약
```
src/
├── app/
│   ├── page.tsx                         # 메인 검색 페이지
│   ├── stock/[ticker]/page.tsx          # 기업 분석 페이지
│   └── api/
│       ├── stocks/search/               # GET ?q= 기업 검색 (yahoo-finance2)
│       ├── stocks/[ticker]/             # GET 시세 (yahoo-finance2)
│       ├── stocks/[ticker]/financials/  # GET 미국 재무제표 (fundamentalsTimeSeries)
│       ├── stocks/[ticker]/news/        # GET 뉴스 (Finnhub / Naver 크롤링)
│       ├── stocks/[ticker]/dart/        # GET 한국 재무제표 (OpenDART API)
│       ├── agent/create-brick/          # POST AI Brick 자동 생성
│       ├── agent/delete-brick/          # DELETE Brick 삭제
│       └── bricks/registry/             # GET/PUT Brick 활성화 관리
├── bricks/                              # ← Brick 플러그인 저장소
├── components/
│   ├── BrickRenderer.tsx                # registry 기반 동적 Brick 렌더링
│   ├── BrickManager.tsx                 # Brick 활성/비활성/삭제 UI
│   ├── AgentPrompt.tsx                  # 자연어 → Brick 생성 UI
│   ├── StockSearch.tsx                  # 기업 검색창
│   └── StockOverview.tsx                # 시세 요약 카드
├── lib/
│   ├── yahoo-finance.ts                 # yahoo-finance2 싱글턴 (new YahooFinance())
│   ├── brick-registry.ts                # registry.json 읽기/쓰기 유틸
│   └── utils.ts                         # formatNumber, detectMarket 등
└── types/index.ts                       # 전체 TypeScript 인터페이스
```

## 데이터 소스
| 용도 | 소스 | 비고 |
|------|------|------|
| US/KR 시세·검색 | `yahoo-finance2` (npm) | `new YahooFinance()` 인스턴스 필수 |
| US 재무제표 | `fundamentalsTimeSeries` API | `quoteSummary` 사용 금지 (Nov 2024 이후 데이터 없음) |
| KR 재무제표 | OpenDART REST API | corp_code는 `corpCode.xml` ZIP 파싱으로 조회 |
| US 뉴스 | Finnhub `/company-news` | `FINNHUB_API_KEY` 필요 |
| KR 뉴스 | Naver Finance 크롤링 | cheerio 사용 |
| AI Brick 생성 | Anthropic Claude API | `claude-sonnet-4-6` 모델 |

## 환경변수 (.env.local)
```
ANTHROPIC_API_KEY=   # AI Brick 생성용
DART_API_KEY=        # 한국 재무제표 (opendart.fss.or.kr)
FINNHUB_API_KEY=     # 미국 뉴스 (finnhub.io)
```

## 새 Brick 추가 방법

### 방법 1: AI 자동 생성 (런타임)
브라우저 사이드바 "AI 기능 추가" 입력창에 프롬프트 입력
→ `POST /api/agent/create-brick` → Claude API가 파일 생성 → 즉시 렌더링

### 방법 2: 수동 생성
```bash
mkdir src/bricks/{brick-id}
# manifest.json, component.tsx, index.ts 작성
# src/bricks/registry.json 에 항목 추가
```

### manifest.json 필수 필드
```json
{
  "id": "kebab-case-id",
  "name": "한국어 이름",
  "description": "한국어 설명",
  "version": "1.0.0",
  "author": "system | ai-agent | user",
  "category": "calculation | chart | research | table | alert",
  "dataRequired": [],
  "enabled": true,
  "createdAt": "YYYY-MM-DD"
}
```

## 자주 쓰는 명령어
```bash
# 타입 체크
npx tsc --noEmit

# DART API 테스트 (삼성전자)
curl http://localhost:3000/api/stocks/005930.KS/dart

# US 재무제표 테스트
curl http://localhost:3000/api/stocks/AAPL/financials

# Brick 목록 확인
curl http://localhost:3000/api/bricks/registry

# TaskMaster 작업 목록
npx --package=task-master-ai task-master list
```

## 주요 타입 (src/types/index.ts)
- `BrickProps` — 모든 Brick 컴포넌트가 받는 props
- `BrickManifest` — manifest.json 스키마
- `FinancialData` — 재무제표 데이터 구조
- `StockQuote` — 시세 데이터
- `Market` — `'KR' | 'US'`
