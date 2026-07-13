// ─────────────────────────────────────────────
// 웹사이트 내장 크롤링 API (방문자 + 관리자 공용)
//
// 방문자 흐름:  start(지역) → 안전장치 통과 시 작업(job) 발급
//              → 가게 1곳씩 kakao_place / naver_place (jobId 필수)
//              → finish(jobId)
// 관리자 흐름:  pass(관리자 비밀번호)를 보내면 jobId 없이 자유 사용
//
// 안전장치:  같은 지역 72시간 쿨다운 · 동시 1건 · 하루 10건
// 카카오/네이버 응답 구조가 바뀌면 ENDPOINTS 블록만 수정하세요.
// ─────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const COOLDOWN_HOURS = 72;   // 같은 지역 재수집 간격
const DAILY_LIMIT = 10;      // 하루 총 수집 작업 수
const JOB_TIMEOUT_MIN = 15;  // 이 시간 넘은 진행중 작업은 죽은 것으로 간주

const ENDPOINTS = {
  kakaoSearch: "https://search.map.kakao.com/mapsearch/map.daum",
  kakaoPlace: (id) => `https://place.map.kakao.com/main/v/${id}`,
  kakaoComments: (id, page) => `https://place.map.kakao.com/commentlist/v/${id}/${page}`,
  naverSearch: "https://map.naver.com/p/api/search/allSearch",
  naverHome: (id) => `https://pcmap.place.naver.com/restaurant/${id}/home`,
  naverGraphql: "https://pcmap-api.place.naver.com/graphql",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const KAKAO_HEADERS = { "User-Agent": UA, Referer: "https://map.kakao.com/", Accept: "application/json" };
const NAVER_HEADERS = { "User-Agent": UA, Referer: "https://map.naver.com/", Accept: "application/json" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const adminPass = process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";
  const isAdmin = body.pass === adminPass;

  try {
    if (body.mode === "start") return await startJob(body.region, isAdmin);
    if (body.mode === "finish") return await finishJob(body.jobId);

    // 가게 단위 조회 — 관리자이거나, 유효한 작업(jobId) 소속이어야 함
    if (body.mode === "kakao_search") {
      if (!isAdmin) return Response.json({ error: "권한이 없습니다." }, { status: 401 });
      return Response.json(await kakaoSearch(body.query, body.limit || 30));
    }
    if (body.mode === "kakao_place") {
      if (!isAdmin && !(await jobAllows(body.jobId, "id", body.id)))
        return Response.json({ error: "유효하지 않은 작업입니다." }, { status: 401 });
      return Response.json(await kakaoPlace(body.id, body.sample || 50));
    }
    if (body.mode === "naver_place") {
      if (!isAdmin && !(await jobAllows(body.jobId, "name", body.name)))
        return Response.json({ error: "유효하지 않은 작업입니다." }, { status: 401 });
      return Response.json(await naverPlace(body.name, body.region, body.recent || 30));
    }
    return Response.json({ error: "알 수 없는 mode" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// ── 작업 시작: 안전장치 검사 → 카카오 검색 → 작업 발급 ──
async function startJob(region, isAdmin) {
  region = (region || "").trim();
  if (region.length < 2) return Response.json({ error: "지역을 입력하세요." }, { status: 400 });
  const sb = db();
  if (!sb) return Response.json({ error: "Supabase 환경변수가 없습니다." }, { status: 500 });

  if (!isAdmin) {
    const since72h = new Date(Date.now() - COOLDOWN_HOURS * 3600 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const staleCut = new Date(Date.now() - JOB_TIMEOUT_MIN * 60 * 1000).toISOString();

    const { data: jobs } = await sb
      .from("crawl_jobs")
      .select("id,region,status,created_at")
      .gte("created_at", since72h);

    const list = jobs || [];
    if (list.some((j) => j.status === "running" && j.created_at > staleCut))
      return Response.json({ blocked: "지금 다른 동네를 수집하고 있어요. 1~2분 뒤에 다시 눌러주세요." });
    if (list.some((j) => j.region === region && j.status === "done"))
      return Response.json({ blocked: `'${region}'은(는) 최근 3일 안에 이미 수집된 동네예요. 위 지역 목록에서 골라보세요.` });
    if (list.filter((j) => j.created_at > since24h).length >= DAILY_LIMIT)
      return Response.json({ blocked: "오늘 수집 한도(10건)에 도달했어요. 내일 다시 시도해주세요." });
  }

  const { candidates } = await kakaoSearch(`${region} 맛집`, 20);
  if (!candidates.length)
    return Response.json({ blocked: "카카오맵에서 이 동네 검색 결과가 없어요. 표기를 바꿔보세요. 예: 서울 마포구 연남동" });

  const { data: job, error } = await sb
    .from("crawl_jobs")
    .insert({ region, status: "running", candidates })
    .select("id")
    .single();
  if (error) return Response.json({ error: `작업 생성 실패: ${error.message}` }, { status: 500 });

  return Response.json({ jobId: job.id, candidates });
}

async function finishJob(jobId) {
  const sb = db();
  if (sb && jobId)
    await sb.from("crawl_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", jobId);
  return Response.json({ ok: true });
}

// jobId가 살아있고, 요청한 가게가 그 작업의 후보 목록에 있는지 확인
async function jobAllows(jobId, field, value) {
  if (!jobId || !value) return false;
  const sb = db();
  if (!sb) return false;
  const { data: job } = await sb.from("crawl_jobs").select("status,candidates,created_at").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "running") return false;
  if (new Date(job.created_at) < new Date(Date.now() - JOB_TIMEOUT_MIN * 60 * 1000)) return false;
  return (job.candidates || []).some((c) => String(c[field]) === String(value));
}

// ── 카카오: 지역 검색 → 후보 목록 ──
async function kakaoSearch(query, limit) {
  const out = [];
  for (let page = 1; page <= 3 && out.length < limit; page++) {
    const url = `${ENDPOINTS.kakaoSearch}?q=${encodeURIComponent(query)}&msFlag=A&sort=0&page=${page}`;
    const r = await fetch(url, { headers: KAKAO_HEADERS });
    if (!r.ok) throw new Error(`카카오 검색 실패 (${r.status}) — 서버 IP가 차단됐을 수 있어요.`);
    const data = await r.json();
    const places = data.place || [];
    if (!places.length) break;
    for (const p of places) {
      const cate = p.cate_name_depth1 || p.category || "";
      const code = p.cate || "";
      if (cate && !cate.includes("음식점") && !cate.includes("카페") && !code.startsWith("FD") && !code.startsWith("CE"))
        continue;
      const full = p.category || p.cate_name || "";
      const parts = full.split(">").map((s) => s.trim()).filter(Boolean);
      out.push({
        id: String(p.confirmid || p.id || ""),
        name: (p.name || "").trim(),
        favorite: Number(p.favorite_cnt || p.favorCnt || 0),
        theme: parts.length > 1 ? parts[1] : parts[0] || "",
      });
    }
    await sleep(400);
  }
  return { candidates: out.filter((c) => c.id) };
}

// ── 카카오: 가게 1곳 상세 + 리뷰 텍스트 ──
async function kakaoPlace(id, sample) {
  const r = await fetch(ENDPOINTS.kakaoPlace(id), { headers: KAKAO_HEADERS });
  if (!r.ok) throw new Error(`카카오 상세 실패 (${r.status})`);
  const data = await r.json();
  const basic = data.basicInfo || {};
  const feed = basic.feedback || {};
  const cat = typeof basic.category === "object" && basic.category ? basic.category : {};

  let texts = ((data.comment || {}).list || []).map((c) => c.contents || "").filter(Boolean);
  for (let page = 2; page <= 4 && texts.length < sample; page++) {
    await sleep(400);
    const cr = await fetch(ENDPOINTS.kakaoComments(id, page), { headers: KAKAO_HEADERS });
    if (!cr.ok) break;
    const list = ((await cr.json()).comment || {}).list || [];
    if (!list.length) break;
    texts = texts.concat(list.map((c) => c.contents || "").filter(Boolean));
  }

  const scoreCnt = Number(feed.scorecnt || 0);
  return {
    rating: scoreCnt ? Math.round((Number(feed.scoresum || 0) / scoreCnt) * 100) / 100 : 0,
    reviews: Number(feed.comntcnt || scoreCnt || 0),
    favorite: Number(feed.favoriteCnt || 0),
    category: cat.catename || "",
    theme_fallback: cat.cate1name || "",
    texts: texts.slice(0, sample),
    kakao_url: `https://place.map.kakao.com/${id}`,
  };
}

// ── 네이버: 업체명 검색 → 상세 + 재방문 비율 ──
async function naverPlace(name, region, recent) {
  const shortRegion = (region || "").split(" ").pop() || "";
  const sUrl = `${ENDPOINTS.naverSearch}?query=${encodeURIComponent(`${shortRegion} ${name}`)}&type=all`;
  const sr = await fetch(sUrl, { headers: NAVER_HEADERS });
  if (!sr.ok) throw new Error(`네이버 검색 실패 (${sr.status}) — 서버 IP가 차단됐을 수 있어요.`);
  const sj = await sr.json().catch(() => null);
  const first = sj?.result?.place?.list?.[0];
  if (!first) return { found: false };

  const pid = String(first.id);
  const lat = first.y ? Number(first.y) : null;
  const lng = first.x ? Number(first.x) : null;

  await sleep(400);
  const hr = await fetch(ENDPOINTS.naverHome(pid), { headers: { ...NAVER_HEADERS, Accept: "text/html" } });
  let info = {};
  if (hr.ok) {
    const html = await hr.text();
    const m = html.match(/window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});/);
    if (m) {
      try {
        const state = JSON.parse(m[1]);
        for (const [k, v] of Object.entries(state)) {
          if ((k.startsWith("PlaceDetailBase") || k.startsWith("RestaurantBase")) && v && typeof v === "object") {
            info = {
              category: v.category || "",
              address: v.roadAddress || v.address || "",
              naver_rating: v.visitorReviewsScore ? Number(v.visitorReviewsScore) : null,
              naver_reviews: v.visitorReviewsTotal ? Number(String(v.visitorReviewsTotal).replace(/,/g, "")) : null,
            };
            break;
          }
        }
        info.hours = extractHours(state);
      } catch {}
    }
  }

  await sleep(400);
  let revisit_pct = 0;
  let sampled = 0;
  try {
    const gq = await fetch(ENDPOINTS.naverGraphql, {
      method: "POST",
      headers: { ...NAVER_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          operationName: "getVisitorReviews",
          variables: {
            input: { businessId: pid, businessType: "restaurant", size: recent, page: 1, sort: "recent", includeContent: true },
          },
          query:
            "query getVisitorReviews($input: VisitorReviewsInput) { visitorReviews(input: $input) { items { id visitCount } total } }",
        },
      ]),
    });
    if (gq.ok) {
      const items = (await gq.json())?.[0]?.data?.visitorReviews?.items || [];
      sampled = items.length;
      if (sampled) {
        const revisit = items.filter((it) => Number(it.visitCount || 1) >= 2).length;
        revisit_pct = Math.round((revisit / sampled) * 1000) / 10;
      }
    }
  } catch {}

  return {
    found: true,
    ...info,
    revisit_pct,
    revisit_sampled: sampled,
    lat,
    lng,
    naver_url: `https://pcmap.place.naver.com/restaurant/${pid}/home`,
  };
}

function extractHours(state) {
  const lines = [];
  for (const v of Object.values(state)) {
    if (!v || typeof v !== "object" || !Array.isArray(v.newBusinessHours) || !v.newBusinessHours.length) continue;
    for (const block of v.newBusinessHours) {
      for (const h of block?.businessHours || []) {
        const day = h?.day?.name || h?.day || "";
        const biz = h?.businessHours || {};
        let line = `${day} ${biz.start || ""} - ${biz.end || ""}`.trim();
        const br = h?.breakHours || [];
        if (br.length) line += ` (브레이크타임 ${br.map((b) => `${b.start || ""} - ${b.end || ""}`).join(", ")})`;
        if (line.replace(/[-\s]/g, "")) lines.push(line);
      }
    }
    break;
  }
  return [...new Set(lines)].join("\n");
}
