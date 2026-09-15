# (주)하이플 DMF 등록 현황 대시보드

기존 `dmf-dashboard`와 동일한 구조이지만, 공공데이터포털 API 호출 시
`entp_name=하이플` 파라미터를 붙여서 **하이플 등록 건만** 수집합니다.

## 기존 프로젝트와 다른 점

1. **`scripts/fetch-dmf.mjs`**
   - `ENTP_NAME_FILTER = "하이플"` 상수 추가 → API 요청 시 `entp_name` 파라미터로 전달
   - 성분명별 집계(`byIngredient`, `topIngredients`, `uniqueIngredients`) 추가

2. **`docs/index.html`**
   - 제목/부제를 "(주)하이플 DMF 등록 현황"으로 변경
   - "등록업체 수" 카드 → **"등록 성분 수"** (회사가 하나뿐이라 업체 수는 의미가 없어서 성분 다양성 지표로 교체)
   - "등록업체 상위 10" 도넛 → **"성분명 상위 10"** 도넛으로 교체
   - "제조국가 상위 10", "제조국가 구성", "연도별 등록 건수"는 그대로 유지 (하이플 등록 건 기준으로 자동 계산됨)

## 설정 방법 (기존 프로젝트와 동일)

1. 이 폴더 전체를 새 GitHub 리포지토리(예: `dmf-highfly`)에 업로드
2. Settings → Secrets and variables → Actions에 `DMF_API_KEY` 등록
   (기존 `dmf-dashboard`에서 쓰던 인증키를 그대로 재사용해도 됩니다)
3. 리포지토리를 Public으로 전환 (무료 GitHub Pages 사용 조건)
4. Settings → Pages에서 Branch: `main`, 폴더: `/docs`로 배포 설정
5. Actions 탭 → `Fetch DMF data` → `Run workflow`로 수동 실행해서 확인

## 만약 데이터가 하나도 안 나온다면

공공데이터포털의 업체명 검색이 정확히 어떤 방식(완전일치/부분일치)으로 동작하는지에 따라
`ENTP_NAME_FILTER` 값을 조정해야 할 수 있습니다. `scripts/fetch-dmf.mjs` 상단의

```js
const ENTP_NAME_FILTER = "하이플";
```

이 줄을 실제 데이터에 등록된 정확한 업체명 표기(예: `"(주)하이플"`, `"주식회사 하이플"` 등)로
바꿔서 다시 실행해보세요.
