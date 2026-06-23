# ERP AI 경영 대시보드

ERP에서 내려받은 CSV 파일을 업로드하면 KPI, 표, 그래프가 포함된 경영 대시보드를 만들고 Gemini AI가 분석보고서를 작성하는 웹사이트입니다. 생성된 보고서는 화면에서 확인한 뒤 PDF 또는 Word 문서로 다운로드할 수 있습니다.

## 기능

- ERP CSV 업로드 및 헤더/행 자동 분석
- 숫자, 날짜, 범주 컬럼 자동 추론
- 매출, 금액, 비용, 수량 등 주요 KPI 자동 구성
- 상위 범주 분포, 숫자 통계, 기간별 추세 그래프 표시
- 컬럼 품질/통계 표와 원본 데이터 미리보기 제공
- Gemini AI 기반 경영진용 분석보고서 생성
- Gemini API 키가 없을 때도 CSV 통계 기반 규칙형 보고서 생성
- 브라우저 PDF 저장 및 Word 호환 문서 다운로드

## 준비

```bash
npm install
copy .env.example .env
```

`.env`에 필요한 값을 채웁니다.

- `MAX_ROWS`: 한 번에 분석할 최대 CSV 행 수입니다. 기본값은 1000입니다.
- `GEMINI_API_KEY`: Gemini AI 보고서 작성에 사용합니다. 비워두면 규칙 기반 보고서를 생성합니다.
- `GEMINI_MODEL`: 사용할 Gemini 모델입니다. 기본값은 `gemini-2.5-flash`입니다.

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

응답에는 `dashboard`, `profile`, `report`, `rows`가 포함됩니다.
