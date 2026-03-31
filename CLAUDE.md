@AGENTS.md

# 주식 분석 도구 — Claude Code 가이드

## 프로젝트 개요
Next.js 15 + TypeScript 기반 주식 분석 웹앱.
한국(KOSPI/KOSDAQ)과 미국(NYSE/NASDAQ) 주식의 재무제표·차트·지표를 분석하며,
**두 개의 독립 플러그인 시스템**으로 구성된다.

1. **Brick 시스템** — UI 분석 컴포넌트 플러그인 (차트, 테이블 등)
2. **Provider 시스템** — 데이터 소스 플러그인 (Yahoo Finance, DART, FRED 등)

AI 에이전트가 자연어 프롬프트를 받아 새 Brick을 실시간으로 생성·추가할 수 있다.

## 개발 서버
```bash
cd F:/n_pj/stock-analyzer
npm run dev        # http://localhost:3000
npx tsc --noEmit   # 타입 검사
```

---

## 핵심 아키텍처 1: Brick 시스템 (UI 플러그인)

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

---

## 핵심 아키텍처 2: Provider 시스템 (데이터 소스 플러그인)

### Provider 디렉토리 구조
```
src/providers/
  registry.json                  ← Provider 목록 (enabled/priority 관리)
  types.ts                       ← ProviderFactory, PriceProvider 등 인터페이스
  provider-registry.ts           ← resolveProvider() 등 CRUD 유틸
  router.ts                      ← market+dataType → Provider 동적 로드
  {provider-id}/
    manifest.json                ← Provider 메타정보
    index.ts                     ← ProviderFactory default export
```

### 등록된 Provider
| ID | 이름 | 시장 | 데이터 타입 | 상태 |
|----|------|------|-----------|------|
| `yahoo-finance` | Yahoo Finance | US·KR | price, financials, search | 활성 |
| `dart` | OpenDART | KR | financials | 활성 |
| `finnhub` | Finnhub | US | news | 활성 |
| `naver-finance` | Naver Finance | KR | news | 활성 |
| `fred` | FRED (연준) | US·GLOBAL | macro | 비활성 |
| `ecos` | ECOS (한국은행) | KR·GLOBAL | macro | 비활성 |

### Provider 라우팅 원칙
- API 라우트는 `router.ts`를 통해 **market + dataType** 조합으로 Provider를 자동 선택
- `registry.json`의 `priority` 값이 낮을수록 우선 선택 (예: `"KR:financials": 0`)
- 같은 조합에 여러 Provider 등록 가능 → fallback 체계 구현 가능

### 새 Provider 추가 방법 (기존 코드 수정 없음)
```bash
# 1. 디렉토리 생성
mkdir src/providers/{provider-id}

# 2. manifest.json 작성 (markets, dataTypes, apiKeyEnvVar 명시)
# 3. index.ts 작성 (ProviderFactory 인터페이스 구현)
# 4. src/providers/registry.json에 항목 추가
# 5. .env.local에 API 키 추가 (필요 시)
```

### Provider manifest.json 필수 필드
```json
{
  "id": "provider-id",
  "name": "표시 이름",
  "description": "설명",
  "version": "1.0.0",
  "author": "system | user | community",
  "markets": ["US", "KR", "GLOBAL"],
  "dataTypes": ["price", "financials", "news", "macro", "search"],
  "requiresApiKey": true,
  "apiKeyEnvVar": "MY_API_KEY",
  "enabled": false,
  "createdAt": "YYYY-MM-DD"
}
```

### Provider index.ts 구조
```typescript
import type { ProviderFactory } from '../types'
import manifest from './manifest.json'

const provider: ProviderFactory = {
  manifest: manifest as ProviderFactory['manifest'],
  createFinancialsProvider: () => ({ ... }),  // 필요한 것만 구현
}
export default provider
```

---

## 파일 구조 요약
```
src/
├── app/
│   ├── page.tsx                              # 메인 검색 페이지
│   ├── stock/[ticker]/page.tsx               # 기업 분석 페이지
│   └── api/
│       ├── stocks/search/                    # GET ?q= 기업 검색
│       ├── stocks/[ticker]/                  # GET 시세 → PriceProvider
│       ├── stocks/[ticker]/financials/       # GET 재무제표 → FinancialsProvider
│       ├── stocks/[ticker]/news/             # GET 뉴스 → NewsProvider
│       ├── stocks/[ticker]/dart/             # GET 한국 재무제표 (레거시 유지)
│       ├── providers/registry/               # GET/PUT Provider 활성화 관리
│       ├── providers/[providerId]/manifest/  # GET Provider 메타정보
│       ├── agent/create-brick/               # POST AI Brick 자동 생성
│       ├── agent/delete-brick/               # DELETE Brick 삭제
│       └── bricks/registry/                  # GET/PUT Brick 활성화 관리
├── bricks/                                   # Brick 플러그인 저장소
├── providers/                                # Provider 플러그인 저장소
├── components/
│   ├── BrickRenderer.tsx                     # registry 기반 동적 Brick 렌더링
│   ├── BrickManager.tsx                      # Brick 활성/비활성/삭제 UI
│   ├── ProviderManager.tsx                   # Provider 활성/비활성 UI
│   ├── AgentPrompt.tsx                       # 자연어 → Brick 생성 UI
│   ├── StockSearch.tsx                       # 기업 검색창
│   └── StockOverview.tsx                     # 시세 요약 카드
├── lib/
│   ├── yahoo-finance.ts                      # yahoo-finance2 싱글턴
│   ├── brick-registry.ts                     # Brick registry 유틸
│   └── utils.ts                              # formatNumber, detectMarket, guessSentiment 등
└── types/index.ts                            # 전체 TypeScript 인터페이스
```

---

## 환경변수 (.env.local)
```
ANTHROPIC_API_KEY=   # AI Brick 생성용
DART_API_KEY=        # 한국 재무제표 (opendart.fss.or.kr)
FINNHUB_API_KEY=     # 미국 뉴스 (finnhub.io)
FRED_API_KEY=        # 거시경제-미국 (fred.stlouisfed.org) — Provider 활성화 시 필요
ECOS_API_KEY=        # 거시경제-한국 (ecos.bok.or.kr) — Provider 활성화 시 필요
```

---

## 자주 쓰는 명령어
```bash
# 타입 체크
npx tsc --noEmit

# 시세 테스트
curl http://localhost:3000/api/stocks/AAPL
curl http://localhost:3000/api/stocks/005930.KS

# 재무제표 테스트
curl http://localhost:3000/api/stocks/AAPL/financials
curl http://localhost:3000/api/stocks/005930.KS/financials

# 뉴스 테스트
curl http://localhost:3000/api/stocks/AAPL/news
curl http://localhost:3000/api/stocks/005930.KS/news

# Provider 목록 확인
curl http://localhost:3000/api/providers/registry

# Brick 목록 확인
curl http://localhost:3000/api/bricks/registry
```

---

## 주요 타입 (src/types/index.ts)
- `BrickProps` — 모든 Brick 컴포넌트가 받는 props
- `BrickManifest` — Brick manifest.json 스키마
- `FinancialData` — 재무제표 데이터 구조
- `StockQuote` — 시세 데이터
- `MacroSeries` — 거시경제 시계열 데이터
- `Market` — `'KR' | 'US' | 'GLOBAL'`

## 주요 타입 (src/providers/types.ts)
- `ProviderFactory` — Provider index.ts의 default export 인터페이스
- `ProviderManifest` — Provider manifest.json 스키마
- `PriceProvider` / `FinancialsProvider` / `NewsProvider` / `MacroProvider`
- `DataType` — `'price' | 'financials' | 'news' | 'macro' | 'search'`
