// ─────────────────────────────────────────────
// 자동 갱신 (Vercel Cron이 매일 호출)
//
//  1. 고객이 요청한 새 동네 (pending) → 우선 수집
//  2. 가장 오래된 동네 → 재수집 (평점·리뷰·태그·의심도 갱신)
//  3. 기준 이상 의심도는 자동 숨김
//
// 한 번 실행에 처리량을 제한해 Vercel 시간 제한 안에서 끝냅니다.
// 수동 실행: /api/cron?key=<ADMIN_PASS>
// ─────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_PLACES_PER_RUN = 60; // 한 번에 검수할 가게 수 상한
const REFRESH_AFTER_DAYS = 7; // 이 기간 지난 동네를 재수집

function clean(v) {
  return (v || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
}

function db() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return url && key ? createClient(url, key) : null;
}

async function callCrawl(origin, payload) {
  const r = await fetch(`${origin}/api/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pass: process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib", ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `crawl ${r.status}`);
  return j;
}

export async function GET(req) {
  const url = new URL(req.url);
  const origin = url.origin;

  // Vercel Cron 호출이거나, key 파라미터가 맞으면 실행
  const isCron = req.headers.get("user-agent")?.includes("vercel-cron");
  const keyOk = url.searchParams.get("key") === (process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib");
  if (!isCron && !keyOk) return Response.json({ error: "권한 없음" }, { status: 401 });

  const sb = db();
  if (!sb) return Response.json({ error: "Supabase 환경변수 없음" }, { status: 500 });

  const report = { started: new Date().toISOString(), regions: [], saved: 0, hidden: 0, skipped: 0 };

  try {
    const { data: setting } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
    const f = {
      rating: Number(setting?.min_kakao_rating ?? 3.5),
      reviews: Number(setting?.min_kakao_reviews ?? 30),
      taste: Number(setting?.min_taste_pct ?? 25),
      mood: Number(setting?.min_mood_pct ?? 25),
      hide: Number(setting?.suspect_hide_score ?? 60),
    };

    // ① 고객이 요청한 새 동네
    const { data: reqs } = await sb
      .from("region_requests")
      .select("id,region,count")
      .eq("status", "pending")
      .order("count", { ascending: false })
      .limit(2);

    // ② 오래된 동네 (마지막 수집이 N일 지난 곳)
    const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * 86400 * 1000).toISOString();
    const { data: stale } = await sb
      .from("restaurants")
      .select("region,crawled_at")
      .lt("crawled_at", cutoff)
      .order("crawled_at", { ascending: true })
      .limit(400);
    const staleRegions = [...new Set((stale || []).map((r) => r.region))].slice(0, 2);

    const targets = [
      ...(reqs || []).map((r) => ({ region: r.region, reqId: r.id, isNew: true })),
      ...staleRegions.map((r) => ({ region: r, isNew: false })),
    ];

    let budget = MAX_PLACES_PER_RUN;

    for (const t of targets) {
      if (budget <= 0) break;
      const regionReport = { region: t.region, new: t.isNew, checked: 0, saved: 0, hidden: 0 };

      const { candidates } = await callCrawl(origin, { mode: "kakao_search", query: `${t.region} 맛집` });
      const list = (candidates || []).sort((a, b) => b.favorite - a.favorite);

      for (const c of list) {
        if (budget <= 0) break;
        if (!c.id || !c.name) continue;
        budget--;
        regionReport.checked++;
        try {
          const d = await callCrawl(origin, { mode: "kakao_place", id: c.id, sample: 50 });
          const taste = d.taste_official ?? 0;
          const mood = d.mood_official ?? 0;
          const okType = taste >= f.taste || mood >= f.mood;
          if (!(d.rating >= f.rating && d.reviews >= f.reviews && okType)) continue;

          const suspectScore = d.suspect_score || 0;
          const autoHide = suspectScore >= f.hide;

          const row = {
            region: t.region,
            name: c.name,
            theme: c.theme || d.theme_fallback || "",
            category: d.category || c.cate_leaf || "",
            kakao_rating: d.rating,
            kakao_reviews: d.reviews,
            taste_pct: taste,
            mood_pct: d.mood_official ?? null,
            address: d.address_hint || "",
            hours: d.hours_hint || "",
            lat: c.lat ?? null,
            lng: c.lng ?? null,
            kakao_url: d.kakao_url || "",
            suspect_score: suspectScore,
            suspect_reasons: d.suspect_reasons || null,
            crawled_at: new Date().toISOString(),
          };
          // 자동 숨김은 의심 시에만 설정 (관리자가 수동으로 되살린 가게를 덮지 않음)
          if (autoHide) row.hidden = true;

          const { error } = await sb.from("restaurants").upsert(row, { onConflict: "region,name" });
          if (!error) {
            regionReport.saved++;
            report.saved++;
            if (autoHide) {
              regionReport.hidden++;
              report.hidden++;
            }
          }
        } catch {
          report.skipped++;
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      if (t.reqId && regionReport.saved > 0) {
        await sb.from("region_requests").update({ status: "done" }).eq("id", t.reqId);
      }
      report.regions.push(regionReport);
    }

    report.finished = new Date().toISOString();
    return Response.json(report);
  } catch (e) {
    return Response.json({ ...report, error: String(e?.message || e) }, { status: 500 });
  }
}
