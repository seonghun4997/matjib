"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../lib/supabase";
import MatjibMap from "./MatjibMap";
import {
  SITE_NAME,
  DEFAULT_FILTERS,
  SAMPLE_RESTAURANTS,
} from "../lib/constants";

// 오래된 데이터의 한 줄 설명에서 통계 문구 제거 (고객창 노출용)
const cleanHighlight = (h) =>
  (h || "")
    .replace(/후기 [\d,]+명 중 [\d,]+명이 '[^']+'[을를] 꼽았어요( · )?/g, "")
    .replace(/^ · | · $/g, "")
    .trim();

export default function Home() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("전체");
  const [theme, setTheme] = useState("전체");
  const [type, setType] = useState("전체"); // 전체 | food | mood
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [dbError, setDbError] = useState("");
  const [sort, setSort] = useState("reco");
  const [search, setSearch] = useState("");
  const [regionQuery, setRegionQuery] = useState("");
  const [reqMsg, setReqMsg] = useState("");
  const [toast, setToast] = useState("");

  async function reload() {
    if (!hasSupabase) {
      setRows(SAMPLE_RESTAURANTS);
      setLoading(false);
      return;
    }
    const [r, s] = await Promise.all([
      supabase
        .from("restaurants")
        .select(
          "id,region,name,theme,category,kakao_rating,kakao_reviews,taste_pct,mood_pct,revisit_pct,naver_reviews,highlight,lat,lng,kakao_url,naver_url,hidden"
        )
        .eq("hidden", false)
        .order("kakao_rating", { ascending: false }),
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (r.error) {
      setDbError(r.error.message);
      setRows(SAMPLE_RESTAURANTS);
      setLoading(false);
      return;
    }
    setDbError("");
    const clean = (r.data || []).filter((x) => x.name);
    setRows(clean.length ? clean : SAMPLE_RESTAURANTS);
    if (s.data) {
      setF({
        min_kakao_rating: Number(s.data.min_kakao_rating),
        min_kakao_reviews: Number(s.data.min_kakao_reviews),
        min_naver_reviews: Number(s.data.min_naver_reviews ?? 0),
        min_taste_pct: Number(s.data.min_taste_pct),
        min_mood_pct: Number(s.data.min_mood_pct ?? 25),
        min_revisit_pct: Number(s.data.min_revisit_pct),
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 공유 링크(?region=...&type=...)로 들어오면 그 상태로 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const rg = q.get("region");
    const tp = q.get("type");
    if (rg) setRegion(decodeURIComponent(rg));
    if (tp === "food" || tp === "mood") setType(tp);
  }, []);

  // 필터 상태를 주소창에 반영 (공유 가능하게)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams();
    if (region !== "전체") q.set("region", region);
    if (type !== "전체") q.set("type", type);
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [region, type]);

  // 선택한 지역/테마가 목록에서 사라지면 '전체'로 자동 복구
  useEffect(() => {
    if (!loading && region !== "전체" && !rows.some((r) => r.region === region)) setRegion("전체");
  }, [rows, region, loading]);
  useEffect(() => {
    if (!loading && theme !== "전체" && !rows.some((r) => r.theme === theme)) setTheme("전체");
  }, [rows, theme, loading]);

  const regions = useMemo(
    () => ["전체", ...Array.from(new Set(rows.map((r) => r.region))).sort()],
    [rows]
  );

  const themes = useMemo(() => {
    const inRegion = rows.filter((r) => region === "전체" || r.region === region);
    return ["전체", ...Array.from(new Set(inRegion.map((r) => r.theme).filter(Boolean))).sort()];
  }, [rows, region]);

  // ── 2단계 검증 ──
  // 카카오 검증: 평점·리뷰수·맛 태그 비율 통과
  // 유형 판정 — 기준을 둘 다 넘으면 두 유형 모두에 해당
  const qualifiesFood = (r) => Number(r.taste_pct ?? 0) >= f.min_taste_pct;
  const qualifiesMood = (r) => Number(r.mood_pct ?? 0) >= f.min_mood_pct;
  const kakaoPass = (r) =>
    Number(r.kakao_rating) >= f.min_kakao_rating &&
    Number(r.kakao_reviews) >= f.min_kakao_reviews &&
    (qualifiesFood(r) || qualifiesMood(r));
  // 네이버 검증: 재방문 데이터가 있고 기준까지 통과
  const naverPass = (r) =>
    r.revisit_pct != null &&
    Number(r.revisit_pct) >= f.min_revisit_pct &&
    (r.naver_reviews == null || Number(r.naver_reviews) >= f.min_naver_reviews);
  // 노출 기준 = 카카오 검증(1단계). 재방문은 '네이버까지 검증' 배지 승격에만 사용
  const passes = (r) => kakaoPass(r);
  const tier = (r) => (passes(r) ? (naverPass(r) ? "naver" : "kakao") : "fail");

  const inScope = (r) =>
    (region === "전체" || r.region === region) &&
    (theme === "전체" || r.theme === theme) &&
    (type === "전체" || (type === "food" ? qualifiesFood(r) : qualifiesMood(r)));

  const SORTS = {
    reco: (a, b) =>
      (naverPass(b) ? 1 : 0) - (naverPass(a) ? 1 : 0) || Number(b.kakao_rating) - Number(a.kakao_rating),
    rating: (a, b) => Number(b.kakao_rating ?? 0) - Number(a.kakao_rating ?? 0),
    revisit: (a, b) => Number(b.revisit_pct ?? -1) - Number(a.revisit_pct ?? -1),
    reviews: (a, b) => Number(b.kakao_reviews ?? 0) - Number(a.kakao_reviews ?? 0),
  };

  const scoped = rows.filter(inScope);
  const visible = scoped
    .filter(passes)
    .filter((r) => !search.trim() || (r.name || "").includes(search.trim()) || (r.category || "").includes(search.trim()))
    .sort(SORTS[sort]);
  const passCount = scoped.filter(passes).length;
  const naverCount = scoped.filter((r) => tier(r) === "naver").length;
  const kakaoCount = scoped.filter((r) => tier(r) === "kakao").length;

  // 동네 검색: 있으면 이동, 없으면 요청 접수 (어드민이 수집)
  async function searchRegion() {
    const q = regionQuery.trim();
    if (q.length < 2) return;
    const hit = regions.find((r) => r !== "전체" && r.includes(q));
    if (hit) {
      setRegion(hit);
      setReqMsg("");
      setRegionQuery("");
      return;
    }
    if (!hasSupabase) return setReqMsg("아직 준비되지 않은 동네예요.");
    try {
      const { data: exist } = await supabase.from("region_requests").select("id,count").eq("region", q).maybeSingle();
      if (exist) {
        await supabase.from("region_requests").update({ count: (exist.count || 1) + 1 }).eq("id", exist.id);
      } else {
        await supabase.from("region_requests").insert({ region: q });
      }
      setReqMsg(`'${q}'은(는) 아직 준비 중이에요. 요청이 접수됐어요 — 곧 추가할게요!`);
    } catch {
      setReqMsg("요청 접수에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
    setRegionQuery("");
  }

  function share(text, url) {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: SITE_NAME, text, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      setToast("링크를 복사했어요");
      setTimeout(() => setToast(""), 2000);
    }
  }

  const shareRegion = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    share(`${region === "전체" ? "우리 동네" : region} 검증 맛집 ${passCount}곳`, url);
  };

  return (
    <div>
      {/* ── 헤더 ── */}
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--card)" }}>
        <div
          className="wrap"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="logo-mark" aria-hidden>
              맛
            </span>
            <div>
              <h1 className="serif" style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>
                {SITE_NAME}
              </h1>
              <p style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>기준을 통과한 맛집만 모았어요</p>
            </div>
          </div>
          <Link href="/admin" style={{ fontSize: 12, color: "var(--sub)", textDecoration: "none" }}>
            관리자
          </Link>
        </div>
      </header>

      <main className="wrap" style={{ padding: "22px 20px 90px" }}>
        <p style={{ fontSize: 13, color: "var(--body)", marginBottom: 20, lineHeight: 1.6 }}>
          카카오맵 평점·리뷰와 네이버 재방문 데이터를 교차 검증해요.{" "}
          <span style={{ color: "var(--sub)" }}>
            현재 {regions.length - 1}개 동네 · 맛집일 확률 높음 {loading ? "…" : kakaoCount}곳 · 무조건 맛집 보장{" "}
            {loading ? "…" : naverCount}곳
          </span>
        </p>

        {!hasSupabase && (
          <p
            style={{
              fontSize: 12,
              color: "var(--stamp)",
              background: "var(--stamp-soft)",
              padding: "8px 12px",
              borderRadius: 12,
              marginBottom: 20,
            }}
          >
            지금은 샘플 데이터 모드입니다. Vercel에 Supabase 환경변수를 넣으면 실제 데이터가 표시됩니다.
          </p>
        )}
        {dbError && (
          <p
            style={{
              fontSize: 12,
              color: "#a3532b",
              background: "#fdf1e8",
              padding: "8px 12px",
              borderRadius: 12,
              marginBottom: 20,
            }}
          >
            Supabase 연결 오류: {dbError} — Vercel 환경변수의 URL/키를 확인하고 Redeploy 하세요.
          </p>
        )}

        {reqMsg && (
          <p style={{ fontSize: 12.5, color: "var(--brass)", background: "var(--stamp-soft)", padding: "10px 12px", borderRadius: 12, marginBottom: 16 }}>
            {reqMsg}
          </p>
        )}

        <div>
          {/* ── 고객 컨트롤: 지역 / 유형 / 테마 ── */}
          <div
            className="card controls-card"
            style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "14px 18px", marginBottom: 20 }}
          >
            <span style={{ display: "flex", gap: 6, flex: "1 1 220px", minWidth: 0 }}>
              <input
                value={regionQuery}
                onChange={(e) => setRegionQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchRegion()}
                placeholder="동네 검색 (예: 연남동)"
                aria-label="동네 검색"
                style={{ flex: 1, minWidth: 0, padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 13 }}
              />
              <button
                onClick={searchRegion}
                style={{ padding: "9px 14px", background: "var(--ink)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13, fontWeight: 600, flexShrink: 0 }}
              >
                찾기
              </button>
            </span>

            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setTheme("전체");
              }}
              aria-label="지역 선택"
              style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 12, background: "#fff", fontSize: 13, fontWeight: 600 }}
            >
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>

            <div className="chips-row" role="tablist" aria-label="맛집 유형">
              {[
                ["전체", "전체"],
                ["food", "🍜 음식맛집"],
                ["mood", "✨ 분위기맛집"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setType(v)}
                  role="tab"
                  aria-selected={type === v}
                  style={{
                    padding: "8px 13px",
                    borderRadius: 999,
                    border: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    background: type === v ? "var(--stamp)" : "var(--paper)",
                    color: type === v ? "#fff" : "var(--body)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {themes.length > 2 && (
              <div className="chips-row" role="tablist" aria-label="카카오 테마">
                {themes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    role="tab"
                    aria-selected={theme === t}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 999,
                      border: 0,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background: theme === t ? "var(--brass)" : "var(--paper)",
                      color: theme === t ? "#fff" : "var(--body)",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── 지도 + 목록 ── */}
          <section aria-label="맛집 지도와 목록">
            <div style={{ marginBottom: 24 }} id="map-anchor">
              <MatjibMap places={scoped.filter(passes)} />
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <h2 className="serif" style={{ fontSize: 18, fontWeight: 900 }}>
                {region} 맛집
              </h2>
              <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                {loading ? "불러오는 중…" : `검증 ${passCount}곳`}
              </span>
              <button
                onClick={shareRegion}
                style={{ marginLeft: "auto", background: "none", border: 0, color: "var(--stamp)", fontSize: 12.5, fontWeight: 600 }}
              >
                공유하기 ↗
              </button>
            </div>

            <div className="list-controls">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="가게 이름·메뉴 검색"
                aria-label="가게 검색"
                style={{ flex: 1, minWidth: 150 }}
              />
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="정렬">
                <option value="reco">추천순 (보장 우선)</option>
                <option value="rating">카카오 평점순</option>
                <option value="revisit">재방문 비율순</option>
                <option value="reviews">리뷰 많은 순</option>
              </select>
            </div>

            {loading && (
              <div style={{ display: "grid", gap: 14 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card">
                    <div className="skel" style={{ width: "40%", height: 20, marginBottom: 14 }} />
                    <div className="skel" style={{ width: "100%", height: 14, marginBottom: 8 }} />
                    <div className="skel" style={{ width: "70%", height: 14 }} />
                  </div>
                ))}
              </div>
            )}

            {!loading && visible.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
                <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 14 }}>
                  {search.trim()
                    ? `'${search.trim()}' 검색 결과가 없어요.`
                    : "이 조건에 맞는 맛집이 아직 없어요."}
                </p>
                {search.trim() ? (
                  <button className="btn-ghost" onClick={() => setSearch("")}>검색 지우기</button>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                    위에서 다른 동네를 검색하거나 유형을 바꿔보세요.
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              {visible.map((r) => (
                <RestaurantCard key={r.id} r={r} tier={tier(r)} food={qualifiesFood(r)} mood={qualifiesMood(r)} onShare={share} />
              ))}
            </div>
          </section>
        </div>
      </main>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--ink)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            zIndex: 999,
          }}
        >
          {toast}
        </div>
      )}

      <footer style={{ borderTop: "1px solid var(--line)", padding: "26px 0", textAlign: "center" }}>
        <p style={{ fontSize: 11.5, color: "var(--sub)" }}>
          평점·리뷰 데이터 출처: 카카오맵, 네이버 플레이스 (수집 시점 기준이며 실제와 다를 수 있습니다)
        </p>
      </footer>
    </div>
  );
}

function TypeChips({ food, mood }) {
  const chip = (isFood) => (
    <span
      key={isFood ? "f" : "m"}
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        background: isFood ? "#fdf0e6" : "#efeafd",
        color: isFood ? "#b4560f" : "#6d43c9",
      }}
    >
      {isFood ? "🍜 음식맛집" : "✨ 분위기맛집"}
    </span>
  );
  return (
    <>
      {food && chip(true)}
      {mood && chip(false)}
      {!food && !mood && chip(true)}
    </>
  );
}

// 안전한 숫자 포맷 (결측 방어)
const num = (v, digits = 0) => (v == null || isNaN(Number(v)) ? null : Number(v).toFixed(digits));

function RestaurantCard({ r, tier, food, mood, onShare }) {
  const hl = cleanHighlight(r.highlight);
  // 대표 태그: 맛 vs 분위기 중 높은 쪽
  const tasteP = Number(r.taste_pct ?? 0);
  const moodP = Number(r.mood_pct ?? 0);
  const isFoodMain = tasteP >= moodP;
  const tagPct = isFoodMain ? (r.taste_pct != null ? tasteP : null) : (r.mood_pct != null ? moodP : null);
  const tagLabel = isFoodMain ? "맛" : "분위기";
  const tagCount =
    tagPct != null && r.kakao_reviews != null ? Math.round((Number(r.kakao_reviews) * tagPct) / 100) : null;
  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, color: "var(--sub)" }}>{r.region}</span>
            <TypeChips food={food} mood={mood} />
          </div>
          <h3 className="serif" style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.3 }}>
            {r.name}
            <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sub)", marginLeft: 10 }}>{r.category}</span>
            {r.theme && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--brass)",
                  background: "var(--stamp-soft)",
                  padding: "3px 9px",
                  borderRadius: 999,
                  marginLeft: 8,
                  verticalAlign: "middle",
                }}
              >
                {r.theme}
              </span>
            )}
          </h3>
          {hl && <p style={{ fontSize: 13, color: "var(--body)", marginTop: 6 }}>{hl}</p>}
        </div>
        <span
          className={`stamp small ${tier === "fail" ? "fail" : ""}`}
          style={tier === "naver" ? { background: "var(--stamp)", color: "#fff" } : undefined}
          title={
            tier === "naver"
              ? "카카오 데이터 + 네이버 재방문 검증까지 전 항목 통과"
              : tier === "kakao"
              ? "카카오 데이터 기준 통과 (재방문 검증 전)"
              : "기준 미달"
          }
        >
          {tier === "naver" ? "무조건 맛집 보장" : tier === "kakao" ? "맛집일 확률 높음" : "미달"}
        </span>
      </div>

      <div className="metrics">
        <span>
          <b style={{ color: "var(--brass)" }}>★ {num(r.kakao_rating, 1) ?? "—"}</b>
          <em>카카오 평점</em>
        </span>
        <span>
          <b>{r.kakao_reviews != null ? Number(r.kakao_reviews).toLocaleString() : "—"}</b>
          <em>카카오 리뷰</em>
        </span>
        <span>
          <b style={{ color: r.revisit_pct != null ? "var(--stamp)" : "var(--sub)" }}>
            {r.revisit_pct != null ? `${r.revisit_pct}%` : "미검증"}
          </b>
          <em>재방문</em>
        </span>
        <span>
          <b>{tagCount != null ? `${tagCount}명 (${tagPct}%)` : "—"}</b>
          <em>{tagLabel} 꼽음</em>
        </span>
      </div>

      <div className="card-actions" style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        <a
          className="btn-primary"
          href={r.kakao_url || `https://map.kakao.com/link/search/${encodeURIComponent(r.name)}`}
          target="_blank"
          rel="noreferrer"
        >
          카카오맵에서 보기
        </a>
        {r.lat && r.lng && (
          <button
            className="btn-ghost"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("matjib:focus", { detail: r.id }));
              document.getElementById("map-anchor")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            지도에서 보기
          </button>
        )}
        <button
          className="btn-ghost"
          onClick={() =>
            onShare(
              `${r.name} — ${cleanHighlight(r.highlight) || "검증된 맛집"}`,
              typeof window !== "undefined"
                ? `${window.location.origin}?region=${encodeURIComponent(r.region)}`
                : ""
            )
          }
          aria-label={`${r.name} 공유`}
        >
          공유
        </button>
        <a
          className="btn-ghost"
          style={{ background: "#e7f8ee", color: "#059142" }}
          href={
            r.naver_url ||
            `https://map.naver.com/p/search/${encodeURIComponent(`${(r.region || "").split(" ").pop()} ${r.name}`)}`
          }
          target="_blank"
          rel="noreferrer"
        >
          네이버지도에서 보기
        </a>
      </div>
    </article>
  );
}

