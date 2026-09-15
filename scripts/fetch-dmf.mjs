// scripts/fetch-dmf.mjs
//
// 식품의약품안전처_원료의약품등록(DMF)현황 오픈API를 호출해서
// 전체 데이터를 페이지네이션으로 수집하고, 대시보드가 읽을 요약 JSON을 만듭니다.
//
// 실행: node scripts/fetch-dmf.mjs
// 필요 환경변수: DMF_API_KEY (공공데이터포털에서 발급받은 인증키, 인코딩된 형태 그대로)

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "https://apis.data.go.kr/1471000/MdcDmfInfoService01/getMdcDmfList01";
const NUM_OF_ROWS = 100;
const MAX_PAGES = 200; // 안전장치: 최대 20,000건까지만 수집

// 특정 업체만 필터링합니다. 공공데이터포털 업체명 필드는 보통 부분일치(LIKE) 검색이라
// "(주)" 등 접두/접미사를 빼고 핵심 상호명만 넣는 편이 더 안전합니다.
const ENTP_NAME_FILTER = "하이플";

// 공공데이터포털에서 내려주는 서비스키는 이미 URL 인코딩된 형태입니다.
// URLSearchParams가 다시 인코딩하면 '+'나 '/' 같은 문자가 깨지므로(더블 인코딩),
// 한 번 디코딩한 원본 값을 넣어 URLSearchParams가 올바르게 인코딩하도록 합니다.
function getDecodedServiceKey() {
  const raw = process.env.DMF_API_KEY;
  if (!raw) {
    throw new Error("환경변수 DMF_API_KEY가 설정되어 있지 않습니다.");
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    // 이미 디코딩된 값이 들어온 경우 그대로 사용
    return raw;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(serviceKey, pageNo, attempt = 1) {
  const MAX_ATTEMPTS = 4;

  const params = new URLSearchParams({
    serviceKey,
    pageNo: String(pageNo),
    numOfRows: String(NUM_OF_ROWS),
    type: "json",
    entp_name: ENTP_NAME_FILTER,
  });

  const url = `${ENDPOINT}?${params.toString()}`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    // 네트워크 레벨 오류(fetch failed 등)는 잠시 대기 후 재시도
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt);
      return fetchPage(serviceKey, pageNo, attempt + 1);
    }
    throw new Error(`네트워크 오류 (page ${pageNo}, ${attempt}회 시도): ${err.message}`);
  }

  if (!res.ok) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt);
      return fetchPage(serviceKey, pageNo, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} (page ${pageNo})`);
  }

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증키 오류 등은 XML로 내려올 수 있어서, 파싱 실패 시 원문을 그대로 보여줌
    throw new Error(
      `JSON 파싱 실패 (page ${pageNo}). 응답 원문 앞부분: ${text.slice(0, 300)}`
    );
  }

  // 이 API는 { response: { header, body } } 형태가 아니라
  // { header, body }가 최상위에 바로 오는 경우가 있어서 둘 다 지원합니다.
  const header = json?.response?.header ?? json?.header;
  if (!header || header.resultCode !== "00") {
    throw new Error(
      `API 오류: ${header?.resultCode ?? "?"} ${header?.resultMsg ?? "알 수 없는 오류"} | 원문: ${text.slice(0, 500)}`
    );
  }

  const body = json?.response?.body ?? json?.body;
  const totalCount = Number(body?.totalCount ?? 0);

  let items = body?.items;
  if (Array.isArray(items)) {
    // items가 바로 배열인 경우 그대로 사용
  } else if (items?.item) {
    // items.item 안에 배열(또는 단일 객체)이 있는 경우
    items = Array.isArray(items.item) ? items.item : [items.item];
  } else {
    items = [];
  }

  return { items, totalCount };
}

async function fetchAll() {
  const serviceKey = getDecodedServiceKey();

  const first = await fetchPage(serviceKey, 1);
  const all = [...first.items];
  const totalCount = first.totalCount;
  const totalPages = Math.min(
    Math.ceil(totalCount / NUM_OF_ROWS),
    MAX_PAGES
  );

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const { items } = await fetchPage(serviceKey, pageNo);
    all.push(...items);
  }

  return { items: all, totalCount };
}

function buildSummary(items) {
  const byCompany = new Map();
  const byCountry = new Map();
  const byIngredient = new Map();

  for (const it of items) {
    const company = it.ENTP_NAME?.trim();
    if (company) byCompany.set(company, (byCompany.get(company) ?? 0) + 1);

    const ingredient = it.INGR_KOR_NAME?.trim();
    if (ingredient) byIngredient.set(ingredient, (byIngredient.get(ingredient) ?? 0) + 1);

    const countries = (it.MANUF_COUNTRY_CODE_NM ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const c of countries) byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }

  const topCompanies = [...byCompany.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topCountries = [...byCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topIngredients = [...byIngredient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const recent = [...items]
    .filter((it) => it.DMF_PERMIT_DATE)
    .sort((a, b) => (a.DMF_PERMIT_DATE < b.DMF_PERMIT_DATE ? 1 : -1))
    .slice(0, 20);

  return {
    uniqueCompanies: byCompany.size,
    uniqueCountries: byCountry.size,
    uniqueIngredients: byIngredient.size,
    topCompanies,
    topCountries,
    topIngredients,
    recent,
  };
}

async function main() {
  console.log("DMF 데이터 수집을 시작합니다...");
  const { items, totalCount } = await fetchAll();
  console.log(`수집 완료: ${items.length} / ${totalCount}건`);

  const summary = buildSummary(items);

  const output = {
    generatedAt: new Date().toISOString(),
    totalCount,
    fetchedCount: items.length,
    summary,
    items,
  };

  const outDir = path.resolve("data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "latest.json");
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`저장 완료: ${outPath}`);
}

main().catch((err) => {
  console.error("데이터 수집 실패:", err.message);
  process.exit(1);
});
