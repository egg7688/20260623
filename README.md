# ERP 경영 대시보드

ERP에서 내려받은 CSV 파일을 업로드하면 KPI, 표, 그래프가 포함된 경영 대시보드를 만드는 웹사이트입니다. 생성된 대시보드는 화면에서 확인한 뒤 PDF 인쇄 또는 Word 문서로 저장할 수 있습니다.

## 기능

- ERP CSV 업로드 및 헤더/행 자동 분석
- 숫자, 날짜, 범주 컬럼 자동 추론
- 매출, 금액, 비용, 수량 등 주요 KPI 자동 구성
- 상위 범주 분포, 숫자 통계, 기간별 추세 그래프 표시
- 컬럼 품질/통계 표와 원본 데이터 미리보기 제공
- 서버 샘플 ERP 데이터 가져오기
- 외부 리포트 URL에 데이터가 없을 때 샘플 ERP 데이터로 대체 생성
- Google Sheets API로 공개 시트 데이터를 가져와 대시보드 생성
- 브라우저 PDF 인쇄 및 Word 호환 대시보드 저장

## 준비

```bash
npm install
copy .env.example .env
```

`.env`에 필요한 값을 채웁니다.

- `MAX_ROWS`: 한 번에 분석할 최대 CSV 행 수입니다. 기본값은 1000입니다.
- `GOOGLE_API_KEY`: Google Sheets API 키입니다. 공개 Google Sheet를 읽을 때 사용합니다.
- `GOOGLE_ACCESS_TOKEN`: Google OAuth Access Token입니다. API 키 대신 인증 토큰으로 읽어야 할 때 사용합니다.

`GOOGLE_API_KEY`와 `GOOGLE_ACCESS_TOKEN` 중 하나만 설정하면 됩니다. 실제 값은 `.env` 또는 Vercel Environment Variables에만 넣고 GitHub에는 커밋하지 마세요.

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## CSV 예시

```csv
일자,부서,거래처,제품,매출,비용,수량
2026-01-05,영업1팀,A상사,ERP Basic,1200000,720000,3
2026-01-12,영업2팀,B전자,ERP Pro,2500000,1400000,5
2026-02-03,영업1팀,C물산,ERP Basic,980000,610000,2
```

컬럼명에 `매출`, `revenue`, `amount`, `금액`, `비용`, `cost`, `수량`, `qty`, `부서`, `거래처`, `제품` 같은 단어가 포함되면 KPI와 그래프 자동 구성 정확도가 높아집니다.

## API

### `POST /api/report`

요청:

```json
{
  "companyName": "커서상사",
  "analysisGoal": "2026년 상반기 매출과 비용 구조 진단",
  "fileName": "erp.csv",
  "csvText": "일자,부서,매출\n2026-01-01,영업1팀,1200000"
}
```

응답에는 `title`, `dashboard`, `profile`, `rows`가 포함됩니다.

### `POST /api/google-sheet`

요청:

```json
{
  "companyName": "커서상사",
  "analysisGoal": "Google Sheets ERP 데이터 기반 매출 분석",
  "spreadsheet": "https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit",
  "range": "A:Z"
}
```

서버의 `GOOGLE_API_KEY` 또는 `GOOGLE_ACCESS_TOKEN`으로 Google Sheets API를 호출한 뒤, 시트 값을 CSV처럼 분석해 같은 대시보드 응답을 반환합니다.
