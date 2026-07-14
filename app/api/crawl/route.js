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

function clean(v) {
  return (v || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
}
function envInfo() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const valid = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url);
  return { url, key, valid };
}
function db() {
  const { url, key } = envInfo();
  return url && key ? createClient(url, key) : null;
}

// Supabase 에러를 한국어 해결책으로 번역
function explain(error) {
  const msg = String(error?.message || error || "");
  if (msg.includes("Invalid path") || msg.includes("Invalid URL"))
    return "Supabase 주소가 잘못됐어요. Vercel 환경변수 NEXT_PUBLIC_SUPABASE_URL 에 Supabase → Settings → API 의 Project URL(https://xxxx.supabase.co 형태)을 넣고 Redeploy 하세요.";
  if (msg.includes("crawl_jobs") || error?.code === "PGRST205" || error?.code === "42P01")
    return "crawl_jobs 테이블이 없어요. Supabase SQL Editor 에서 supabase/update-v6-public-crawl.sql 을 실행하세요.";
  if (msg.includes("JWT") || msg.includes("apikey") || error?.code === "401")
    return "Supabase 키가 잘못됐어요. NEXT_PUBLIC_SUPABASE_ANON_KEY 에 anon public 키를 넣고 Redeploy 하세요.";
  return msg;
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const adminPass = process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";
  const isAdmin = body.pass === adminPass;

  try {
    if (body.mode === "start") return await startJob(body.region, isAdmin);
    if (body.mode === "finish") return await finishJob(body.jobId, body.saved);

    // 가게 단위 조회 — 관리자이거나, 유효한 작업(jobId) 소속이어야 함
    if (body.mode === "naver_debug") {
      if (!isAdmin) return Response.json({ error: "권한이 없습니다." }, { status: 401 });
      return Response.json(await naverDebug(body.query || "성북동 쌍다리돼지불백", body.lat, body.lng));
    }
    if (body.mode === "kakao_debug") {
      if (!isAdmin) return Response.json({ error: "권한이 없습니다." }, { status: 401 });
      return Response.json(await kakaoDebug(body.query || "서울 성북동 맛집"));
    }
    if (body.mode === "kakao_search") {
      if (!isAdmin) return Response.json({ error: "권한이 없습니다." }, { status: 401 });
      return Response.json(await kakaoSearch(body.query, body.limit || 500));
    }
    if (body.mode === "kakao_place") {
      if (!isAdmin && !(await jobAllows(body.jobId, "id", body.id)))
        return Response.json({ error: "유효하지 않은 작업입니다." }, { status: 401 });
      return Response.json(await kakaoPlace(body.id, body.sample || 50));
    }
    if (body.mode === "naver_place") {
      if (!isAdmin && !(await jobAllows(body.jobId, "name", body.name)))
        return Response.json({ error: "유효하지 않은 작업입니다." }, { status: 401 });
      return Response.json(await naverPlace(body.name, body.region, body.recent || 30, body.lat, body.lng));
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
  const env = envInfo();
  if (!env.url || !env.key)
    return Response.json({ error: "Vercel 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수를 넣고 Redeploy 하세요." }, { status: 500 });
  if (!env.valid)
    return Response.json({ error: `Supabase 주소 형식이 잘못됐어요 (현재: ${env.url}). Settings → API 의 Project URL(https://xxxx.supabase.co)로 바꾸고 Redeploy 하세요.` }, { status: 500 });
  const sb = db();

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
    if (list.some((j) => j.region === region && j.status === "done")) {
      const { count } = await sb
        .from("restaurants")
        .select("id", { count: "exact", head: true })
        .eq("region", region);
      if ((count || 0) > 0)
        return Response.json({ blocked: `'${region}'은(는) 최근 3일 안에 이미 수집된 동네예요. 위 지역 목록에서 골라보세요.` });
      // 기록만 있고 데이터가 없으면 (과거 실패) 재수집 허용
    }
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
  if (error) return Response.json({ error: `작업 생성 실패 — ${explain(error)}` }, { status: 500 });

  return Response.json({ jobId: job.id, candidates });
}

async function finishJob(jobId, saved) {
  const sb = db();
  if (sb && jobId)
    await sb
      .from("crawl_jobs")
      .update({ status: Number(saved) > 0 ? "done" : "failed", finished_at: new Date().toISOString() })
      .eq("id", jobId);
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

// ── 진단: 네이버 검색 주소 3종의 응답 상태/구조 확인 (관리자용) ──
async function naverDebug(query, lat, lng) {
  const out = { query, attempts: [] };
  for (const a of NAVER_SEARCH_ATTEMPTS(query, lng, lat)) {
    try {
      const res = await fetch(a.url, { headers: NAVER_HEADERS });
      const body = await res.text();
      const entry = { tag: a.tag, status: res.status, url: a.url.slice(0, 120) };
      try {
        const json = JSON.parse(body);
        entry.key_tree = keyTree(json);
        const hit = firstPlaceHit(json);
        if (hit) entry.first_hit = Object.fromEntries(Object.entries(hit).slice(0, 15).map(([k, v]) => [k, String(v).slice(0, 50)]));
      } catch {
        entry.body_head = body.slice(0, 300);
      }
      out.attempts.push(entry);
    } catch (e) {
      out.attempts.push({ tag: a.tag, error: String(e?.message || e).slice(0, 80) });
    }
    await sleep(300);
  }
  return out;
}

// ── 카카오: 지역 검색 → 후보 목록 ──
async function kakaoSearch(query, limit) {
  const out = [];
  const seen = new Set();
  const maxPages = Math.min(34, Math.ceil(limit / 10) + 1); // 결과가 빌 때까지 끝까지
  for (let page = 1; page <= maxPages && out.length < limit; page++) {
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
      const pid = String(p.confirmid || p.cid || p.docid || p.id || "");
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      out.push({
        id: pid,
        name: (p.name || "").trim(),
        // 즐겨찾기 수치가 신형 응답에 없어 검색의 리뷰 수를 랭킹 대체값으로 사용
        favorite: Number(p.favorite_cnt || p.favorCnt || p.reviewCount || 0),
        theme: p.cate_name_depth2 || (parts.length > 1 ? parts[1] : parts[0] || ""),
        cate_leaf: p.last_cate_name || (parts.length ? parts[parts.length - 1] : ""),
        lat: p.lat != null ? Number(p.lat) : null,
        lng: p.lon != null ? Number(p.lon) : null,
      });
    }
    await sleep(400);
  }
  return { candidates: out.filter((c) => c.id) };
}

// ── 카카오: 가게 1곳 상세 + 리뷰 텍스트 ──
// 카카오가 내부 주소를 바꿔온 이력이 있어 예비 주소를 순서대로 시도합니다.
const DETAIL_ATTEMPTS = (id) => [
  { tag: "main/v", url: `https://place.map.kakao.com/main/v/${id}`, headers: KAKAO_HEADERS },
  {
    tag: "m/main/v",
    url: `https://place.map.kakao.com/m/main/v/${id}`,
    headers: { ...KAKAO_HEADERS, Referer: `https://place.map.kakao.com/${id}` },
  },
  {
    tag: "panel3",
    url: `https://place-api.map.kakao.com/places/panel3/${id}`,
    headers: { ...KAKAO_HEADERS, pf: "web", Origin: "https://place.map.kakao.com", Referer: `https://place.map.kakao.com/${id}` },
  },
];

// JSON 어디에 있든 평점/리뷰 덩어리를 찾아내는 탐색기
function deepFind(obj, pred, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 7) return null;
  if (pred(obj)) return obj;
  for (const v of Object.values(obj)) {
    const found = deepFind(v, pred, depth + 1);
    if (found) return found;
  }
  return null;
}
function deepFindComments(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 7) return null;
  if (Array.isArray(obj) && obj.length && obj.some((it) => it && typeof it === "object" && typeof (it.contents ?? it.content) === "string"))
    return obj;
  for (const v of Object.values(obj)) {
    const found = deepFindComments(v, depth + 1);
    if (found) return found;
  }
  return null;
}
const num = (o, ...keys) => {
  for (const k of keys) if (o && o[k] != null && !isNaN(Number(o[k]))) return Number(o[k]);
  return 0;
};

// panel3의 open_hours 를 읽을 수 있는 문자열로 (구조가 유동적이라 방어적으로)
function kakaoHours(data) {
  try {
    const oh = data?.open_hours;
    if (!oh) return "";
    const strs = [];
    (function walk(o, d) {
      if (o == null || d > 5) return;
      if (typeof o === "string") {
        const s = o.trim();
        if (s && !strs.includes(s)) strs.push(s);
        return;
      }
      if (typeof o !== "object") return;
      for (const v of Object.values(o)) walk(v, d + 1);
    })(oh.week_from_today?.week_periods || [], 0);
    if (strs.length) return strs.join(" ").slice(0, 400);
    const head = oh.headline?.display_text;
    const info = oh.headline?.display_text_info;
    return [head, info].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

// 카카오 후기 강점 태그에서 특정 태그(맛/분위기 등) 선택 인원 ÷ 후기 수 (%)
function strengthPct(kr, label) {
  try {
    const ks = kr?.score_set;
    const total = Number(ks?.review_count || 0);
    if (!total) return null;
    const nameById = {};
    for (const d of kr?.strength_description || []) if (d?.id != null) nameById[String(d.id)] = d?.name || "";
    for (const c of ks?.strength_counts || []) {
      if (!c || typeof c !== "object") continue;
      const nm = c.name || nameById[String(c.id)] || "";
      if (nm === label || nm.startsWith(label)) {
        const cnt = Number(c.count ?? c.cnt ?? c.uv ?? c.value ?? 0);
        return Math.round((cnt / total) * 1000) / 10;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// 대표 메뉴 이름 (한 줄 설명용)
function topMenus(data) {
  try {
    const items = data?.menu?.menus?.items || [];
    const names = [];
    for (const it of items) {
      const nm = typeof it === "string" ? it : it?.name || it?.menu_name || it?.menuName || it?.item_name || it?.title || "";
      if (nm) names.push(String(nm).slice(0, 24));
      if (names.length >= 3) break;
    }
    return names;
  } catch {
    return [];
  }
}

// 후기조작 의심도 (0~100점) — 어드민 판단용, 기준점 이상은 자동 숨김
// 기준 A: 특정 시기에 평균별점 4.9~5.0 리뷰어들이 집중 등록
// 기준 B: 후기 대비 맛/분위기 태그 비율이 압도적으로 높음 (평균 20~40%)
function suspicion(data, rating, reviews, tastePct, moodPct) {
  let score = 0;
  const reasons = [];
  try {
    // A-1. 사진 리뷰어 프로필의 평균별점 분포
    const owners = [];
    const seen = new Set();
    for (const ph of data?.photos?.photos || []) {
      const o = ph?.kakaomap_review_photo_meta?.owner;
      if (!o) continue;
      const key = `${o.review_count}-${o.average_score}`;
      if (seen.has(key)) continue;
      seen.add(key);
      owners.push(o);
    }
    if (owners.length >= 5) {
      const five = owners.filter((o) => Number(o.average_score) >= 4.9).length;
      const pct = five / owners.length;
      if (pct >= 0.8) {
        score += 45;
        reasons.push(`리뷰어 ${owners.length}명 중 ${five}명(${Math.round(pct * 100)}%)이 평균별점 4.9+`);
      } else if (pct >= 0.6) {
        score += 30;
        reasons.push(`리뷰어 ${owners.length}명 중 ${five}명이 평균별점 4.9+`);
      }
      const newbies = owners.filter((o) => Number(o.review_count) <= 3 && Number(o.average_score) >= 4.9).length;
      if (newbies >= 3) {
        score += 15;
        reasons.push(`신규계정(리뷰 3개↓) 만점 리뷰어 ${newbies}명`);
      }
    }
    // A-2. 리뷰 등록일이 특정 시기에 집중 (숫자/문자 날짜 모두 지원)
    const toDate = (v) => {
      if (v == null) return null;
      if (typeof v === "number") return v > 1e12 ? v : v > 1e9 ? v * 1000 : null;
      const s = String(v);
      if (/^\d{13}$/.test(s)) return Number(s);
      if (/^\d{10}$/.test(s)) return Number(s) * 1000;
      const m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
      if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
      const t = Date.parse(s);
      return isNaN(t) ? null : t;
    };
    const dates = (data?.kakaomap_review?.reviews || [])
      .map((rv) => toDate(rv?.registered_at ?? rv?.updated_at))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (dates.length >= 5) {
      const span = 14 * 86400 * 1000;
      let best = 0;
      for (const s0 of dates) best = Math.max(best, dates.filter((d) => d >= s0 && d <= s0 + span).length);
      if (best / dates.length >= 0.7) {
        score += 25;
        reasons.push(`최근 리뷰 ${dates.length}개 중 ${best}개가 2주 안에 집중 등록`);
      }
    }
    // B. 태그 비율 과다
    const top = Math.max(Number(tastePct ?? 0), Number(moodPct ?? 0));
    const tag = Number(tastePct ?? 0) >= Number(moodPct ?? 0) ? "맛" : "분위기";
    if (top >= 75) {
      score += 30;
      reasons.push(`${tag} 태그 비율 ${top}% — 평균(20~40%) 대비 압도적`);
    } else if (top >= 60) {
      score += 15;
      reasons.push(`${tag} 태그 비율 ${top}%로 높은 편`);
    }
  } catch {}
  return { score: Math.min(100, score), reasons: reasons.join(" / ") };
}

async function kakaoPlace(id, sample) {
  const fails = [];

  // ① 신형 panel3 — 진단으로 확인한 실제 구조 (kakaomap_review.score_set)
  try {
    const a = DETAIL_ATTEMPTS(id).find((x) => x.tag === "panel3");
    const res = await fetch(a.url, { headers: a.headers });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const ks = data?.kakaomap_review?.score_set;
      if (ks && (ks.review_count != null || ks.average_score != null)) {
        const texts = (data.kakaomap_review.reviews || [])
          .map((rv) => rv?.contents || "")
          .filter(Boolean);
        const cat = data.summary?.category || {};
        const cnt = Number(ks.review_count || 0);
        const _rating =
          ks.average_score != null
            ? Math.round(Number(ks.average_score) * 100) / 100
            : cnt
            ? Math.round((Number(ks.total_score || 0) / cnt) * 100) / 100
            : 0;
        const _taste = strengthPct(data.kakaomap_review, "맛");
        const _mood = strengthPct(data.kakaomap_review, "분위기");
        const sus = suspicion(data, _rating, cnt, _taste, _mood);
        return {
          rating:
            ks.average_score != null
              ? Math.round(Number(ks.average_score) * 100) / 100
              : cnt
              ? Math.round((Number(ks.total_score || 0) / cnt) * 100) / 100
              : 0,
          reviews: cnt,
          favorite: 0,
          category: cat.name4 || cat.name3 || cat.name || "",
          theme_fallback: cat.name2 || "",
          texts: texts.slice(0, sample),
          taste_official: strengthPct(data.kakaomap_review, "맛"),
          mood_official: strengthPct(data.kakaomap_review, "분위기"),
          menus: topMenus(data),
          address_hint: data.summary?.address?.road || data.summary?.address?.disp || "",
          hours_hint: kakaoHours(data),
          kakao_url: `https://place.map.kakao.com/${id}`,
          suspect_score: sus.score,
          suspect_reasons: sus.reasons,
          source: "panel3",
        };
      }
      fails.push("panel3:no-score_set");
    } else {
      fails.push(`panel3:${res.status}`);
    }
  } catch (e) {
    fails.push(`panel3:${String(e?.message || e).slice(0, 40)}`);
  }
  await sleep(300);

  // ② 구형 main/v — 혹시 되살아나는 경우 대비한 예비
  for (const a of DETAIL_ATTEMPTS(id).filter((x) => x.tag !== "panel3")) {
    try {
      const res = await fetch(a.url, { headers: a.headers });
      if (!res.ok) {
        fails.push(`${a.tag}:${res.status}`);
        continue;
      }
      const data = await res.json().catch(() => null);
      if (!data) {
        fails.push(`${a.tag}:not-json`);
        continue;
      }
      const feed = deepFind(data, (o) => "scoresum" in o && "scorecnt" in o);
      if (!feed) {
        fails.push(`${a.tag}:no-score`);
        continue;
      }
      const scoreCnt = num(feed, "scorecnt");
      const cat = deepFind(data, (o) => "catename" in o) || {};
      const texts = (deepFindComments(data) || []).map((c) => c.contents ?? c.content ?? "").filter(Boolean);
      return {
        rating: scoreCnt ? Math.round((num(feed, "scoresum") / scoreCnt) * 100) / 100 : 0,
        reviews: num(feed, "comntcnt") || scoreCnt,
        favorite: num(feed, "favoriteCnt"),
        category: cat.catename || "",
        theme_fallback: cat.cate1name || "",
        texts: texts.slice(0, sample),
        address_hint: "",
        kakao_url: `https://place.map.kakao.com/${id}`,
        source: a.tag,
      };
    } catch (e) {
      fails.push(`${a.tag}:${String(e?.message || e).slice(0, 40)}`);
    }
    await sleep(300);
  }
  throw new Error(`카카오 상세 실패 (${fails.join(" · ")})`);
}

// JSON 구조를 사람이 읽을 수 있는 키 지도로 요약
function keyTree(o, depth = 0) {
  if (depth > 3) return "…";
  if (Array.isArray(o)) return o.length ? [keyTree(o[0], depth + 1)] : [];
  if (o && typeof o === "object") {
    const out = {};
    for (const [k, v] of Object.entries(o).slice(0, 25)) out[k] = keyTree(v, depth + 1);
    return out;
  }
  return typeof o === "string" ? "str" : typeof o;
}
// 평점/리뷰 냄새가 나는 키를 경로째 수집
function scanKeys(o, path = "", out = [], depth = 0) {
  if (!o || typeof o !== "object" || depth > 6 || out.length > 50) return out;
  for (const [k, v] of Object.entries(o)) {
    const p = `${path}.${k}`;
    if (/score|star|review|comment|rating|grade|point/i.test(k))
      out.push({ path: p, value: typeof v === "object" ? "(객체)" : String(v).slice(0, 50) });
    scanKeys(v, p, out, depth + 1);
  }
  return out;
}

// ── 진단: 검색 원본 + 상세 주소별 응답 상태를 그대로 반환 (관리자용) ──
async function kakaoDebug(query) {
  const url = `${ENDPOINTS.kakaoSearch}?q=${encodeURIComponent(query)}&msFlag=A&sort=0&page=1`;
  const r = await fetch(url, { headers: KAKAO_HEADERS });
  const out = { search_status: r.status };
  if (!r.ok) return out;
  const data = await r.json().catch(() => null);
  const first = data?.place?.[0];
  if (!first) return { ...out, note: "place 배열이 비어있음", top_keys: Object.keys(data || {}) };
  out.first_place_fields = Object.fromEntries(
    Object.entries(first).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 60) : v]).slice(0, 40)
  );
  const id = String(first.confirmid || first.cid || first.docid || first.id || "");
  out.place_id = id;
  out.detail_attempts = [];
  for (const a of DETAIL_ATTEMPTS(id)) {
    try {
      const res = await fetch(a.url, { headers: a.headers });
      const body = await res.text();
      const entry = { tag: a.tag, status: res.status };
      try {
        const json = JSON.parse(body);
        entry.key_tree = keyTree(json);
        entry.score_like_keys = scanKeys(json);
      } catch {
        entry.body_head = body.slice(0, 300);
      }
      out.detail_attempts.push(entry);
    } catch (e) {
      out.detail_attempts.push({ tag: a.tag, error: String(e?.message || e).slice(0, 80) });
    }
    await sleep(300);
  }

  // 리뷰 텍스트가 있을 법한 주소 후보들도 상태 확인
  const REVIEW_GUESSES = [
    { tag: "commentlist", url: `https://place.map.kakao.com/commentlist/v/${id}/1`, headers: KAKAO_HEADERS },
    {
      tag: "tab/reviews",
      url: `https://place-api.map.kakao.com/places/tab/reviews/${id}`,
      headers: { ...KAKAO_HEADERS, pf: "web", Origin: "https://place.map.kakao.com", Referer: `https://place.map.kakao.com/${id}` },
    },
    {
      tag: "panel3/reviews",
      url: `https://place-api.map.kakao.com/places/panel3/${id}/reviews`,
      headers: { ...KAKAO_HEADERS, pf: "web", Origin: "https://place.map.kakao.com", Referer: `https://place.map.kakao.com/${id}` },
    },
  ];
  out.review_attempts = [];
  for (const a of REVIEW_GUESSES) {
    try {
      const res = await fetch(a.url, { headers: a.headers });
      const body = await res.text();
      const entry = { tag: a.tag, status: res.status };
      try {
        entry.key_tree = keyTree(JSON.parse(body));
      } catch {
        entry.body_head = body.slice(0, 200);
      }
      out.review_attempts.push(entry);
    } catch (e) {
      out.review_attempts.push({ tag: a.tag, error: String(e?.message || e).slice(0, 80) });
    }
    await sleep(300);
  }
  return out;
}

// ── 네이버: 업체명 검색 → 상세 + 재방문 비율 ──
// 네이버 검색 주소 후보들 (좌표를 넣어야 하는 신형 → 구형 순)
function NAVER_SEARCH_ATTEMPTS(query, lng, lat) {
  const q = encodeURIComponent(query);
  const coord = lng && lat ? encodeURIComponent(`${lng};${lat}`) : "";
  return [
    { tag: "allSearch", url: `https://map.naver.com/p/api/search/allSearch?query=${q}&type=all&searchCoord=${coord}&boundary=` },
    {
      tag: "v5",
      url: `https://map.naver.com/v5/api/search?caller=pcweb&query=${q}&type=all&page=1&displayCount=5&lang=ko${coord ? `&searchCoord=${coord}` : ""}`,
    },
    { tag: "instant", url: `https://map.naver.com/p/api/search/instant-search?query=${q}&coords=${lat || ""},${lng || ""}` },
  ];
}

// 응답 구조가 달라도 첫 번째 장소를 찾아내는 추출기
function firstPlaceHit(json) {
  const direct = [json?.result?.place?.list, json?.place, json?.items, json?.result?.place];
  for (const arr of direct) if (Array.isArray(arr) && arr.length && arr[0]?.id) return arr[0];
  // 깊이 탐색: id 와 좌표(x/y 또는 lon/lat)를 가진 항목 배열
  function walk(o, depth = 0) {
    if (!o || typeof o !== "object" || depth > 6) return null;
    if (Array.isArray(o) && o.length && o[0] && typeof o[0] === "object" && o[0].id && (o[0].x != null || o[0].lon != null))
      return o[0];
    for (const v of Object.values(o)) {
      const f = walk(v, depth + 1);
      if (f) return f;
    }
    return null;
  }
  return walk(json);
}

async function naverPlace(name, region, recent, hintLat, hintLng) {
  const shortRegion = (region || "").split(" ").pop() || "";
  const fails = [];
  let first = null;
  for (const a of NAVER_SEARCH_ATTEMPTS(`${shortRegion} ${name}`, hintLng, hintLat)) {
    try {
      const sr = await fetch(a.url, { headers: NAVER_HEADERS });
      if (!sr.ok) {
        fails.push(`${a.tag}:${sr.status}`);
        await sleep(300);
        continue;
      }
      const sj = await sr.json().catch(() => null);
      if (sj?.result?.ncaptcha || sj?.result?.type === "ncaptcha") {
        return { found: false, captcha: true };
      }
      first = firstPlaceHit(sj);
      if (first) break;
      fails.push(`${a.tag}:no-place`);
    } catch (e) {
      fails.push(`${a.tag}:${String(e?.message || e).slice(0, 30)}`);
    }
    await sleep(300);
  }
  if (!first) {
    return { found: false, captcha: fails.some((f) => f.includes("captcha")) };
  }

  const pid = String(first.id);
  const lat = first.y != null ? Number(first.y) : first.lat != null ? Number(first.lat) : null;
  const lng = first.x != null ? Number(first.x) : first.lon != null ? Number(first.lon) : null;

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
