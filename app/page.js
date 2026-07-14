"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../lib/supabase";
import MatjibMap from "./MatjibMap";
import {
  SITE_NAME,
  DEFAULT_FILTERS,
  SAMPLE_RESTAURANTS,
  revisitPctToRatio,
} from "../lib/constants";

// 음식맛집 / 분위기맛집 분류: 카카오 '맛' 태그 vs '분위기' 태그 비율 비교
const typeOf = (r) => (Number(r.taste_pct ?? 0) >= Number(r.mood_pct ?? 0) ? "food" : "mood");

export default function Home() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("전체");
  const [theme, setTheme] = useState("전체");
  const [type, setType] = useState("전체"); // 전체 | food | mood
  const [passOnly, setPassOnly] = useState(true);
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [dbError, setDbError] = useState("");
  const [sort, setSort] = useState("rating");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches) {
      setFilterOpen(false);
    }
  }, []);

  async function reload() {
    if (!hasSupabase) {
      setRows(SAMPLE_RESTAURANTS);
      setLoading(false);
      return;
    }
    const [r, s] = await Promise.all([
      supabase.from("restaurants").select("*").order("kakao_rating", { ascending: false }),
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (r.error) {
      setDbError(r.error.message);
      setRows(SAMPLE_RESTAURANTS);
      setLoading(false);
      return;
    }
    setDbError("");
    setRows(r.data?.length ? r.data : SAMPLE_RESTAURANTS);
    if (s.data) {
      setF({
        min_kakao_rating: Number(s.data.min_kakao_rating),
        min_kakao_reviews: Number(s.data.min_kakao_reviews),
        min_naver_reviews: Number(s.data.min_naver_reviews ?? 0),
        min_taste_pct: Number(s.data.min_taste_pct),
        min_revisit_pct: Number(s.data.min_revisit_pct),
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const kakaoPass = (r) =>
    Number(r.kakao_rating) >= f.min_kakao_rating &&
    Number(r.kakao_reviews) >= f.min_kakao_reviews &&
    Number(r.taste_pct ?? 0) >= f.min_taste_pct;
  // 네이버 검증: 재방문 데이터가 있고 기준까지 통과
  const naverPass = (r) =>
    r.revisit_pct != null &&
    Number(r.revisit_pct) >= f.min_revisit_pct &&
    (r.naver_reviews == null || Number(r.naver_reviews) >= f.min_naver_reviews);
  // 노출 기준: 카카오 통과 + (네이버 항목은 미측정이면 보류, 있으면 기준 적용)
  const passes = (r) =>
    kakaoPass(r) &&
    (r.naver_reviews == null || Number(r.naver_reviews) >= f.min_naver_reviews) &&
    (r.revisit_pct == null || Number(r.revisit_pct) >= f.min_revisit_pct);
  const tier = (r) => (passes(r) ? (naverPass(r) ? "naver" : "kakao") : "fail");

  const inScope = (r) =>
    (region === "전체" || r.region === region) &&
    (theme === "전체" || r.theme === theme) &&
    (type === "전체" || typeOf(r) === type);

  const SORTS = {
    rating: (a, b) => Number(b.kakao_rating) - Number(a.kakao_rating),
    revisit: (a, b) => Number(b.revisit_pct ?? -1) - Number(a.revisit_pct ?? -1),
    reviews: (a, b) => Number(b.kakao_reviews) - Number(a.kakao_reviews),
  };

  const scoped = rows.filter(inScope);
  const visible = scoped
    .filter((r) => (passOnly ? passes(r) : true))
    .filter((r) => !search.trim() || r.name.includes(search.trim()) || (r.category || "").includes(search.trim()))
    .sort(SORTS[sort]);
  const passCount = scoped.filter(passes).length;
  const naverCount = scoped.filter((r) => tier(r) === "naver").length;
  const kakaoCount = scoped.filter((r) => tier(r) === "kakao").length;

  const resetFilters = () => setF(DEFAULT_FILTERS);
  const set = (k) => (e) => setF({ ...f, [k]: Number(e.target.value) });

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
            현재 {regions.length - 1}개 동네 · 카카오 검증 {loading ? "…" : kakaoCount}곳 · 네이버까지 검증{" "}
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

        <div className="layout">
          {/* ── 검수 기준 ── */}
          <aside className="filter-panel card" style={{ position: "sticky", top: 20 }} aria-label="검수 기준">
            <button className="filter-toggle" onClick={() => setFilterOpen(!filterOpen)} aria-expanded={filterOpen}>
              <span>검수 기준 · 검증 {passCount}곳</span>
              <span style={{ color: "var(--stamp)", fontSize: 13 }}>{filterOpen ? "접기 ▲" : "조정하기 ▼"}</span>
            </button>

            <div className={`filter-body ${filterOpen ? "" : "closed"}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 className="serif filter-title" style={{ fontSize: 15, fontWeight: 900 }}>
                  검수 기준
                </h2>
                <button
                  onClick={resetFilters}
                  style={{ background: "none", border: 0, color: "var(--sub)", fontSize: 11.5, padding: 0, textDecoration: "underline" }}
                >
                  초기화
                </button>
              </div>
              <p style={{ fontSize: 11, color: "var(--sub)", marginBottom: 18 }}>기준을 움직이면 바로 걸러져요.</p>

              <div style={{ marginBottom: 16 }}>
                <div className="field-label">지역</div>
                <select
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    setTheme("전체");
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, background: "#fff", fontSize: 13 }}
                >
                  {regions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="field-label">맛집 유형</div>
                <div style={{ display: "flex", gap: 6 }} role="tablist" aria-label="맛집 유형">
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
                        flex: 1,
                        padding: "7px 4px",
                        borderRadius: 10,
                        border: 0,
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: type === v ? "var(--stamp)" : "var(--paper)",
                        color: type === v ? "#fff" : "var(--body)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {themes.length > 2 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="field-label">카카오 테마</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="tablist" aria-label="카카오 테마">
                    {themes.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        role="tab"
                        aria-selected={theme === t}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          border: 0,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: theme === t ? "var(--stamp)" : "var(--paper)",
                          color: theme === t ? "#fff" : "var(--body)",
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <FilterRow
                label="카카오 평점"
                value={`${f.min_kakao_rating.toFixed(1)}점 이상`}
                min={0} max={5} step={0.1}
                v={f.min_kakao_rating}
                onChange={set("min_kakao_rating")}
              />
              <FilterRow
                label="카카오 리뷰 수"
                min={0} max={500} step={10}
                v={f.min_kakao_reviews}
                onChange={set("min_kakao_reviews")}
                editable unit="개"
              />
              <FilterRow
                label="네이버 리뷰 수"
                min={0} max={2000} step={50}
                v={f.min_naver_reviews}
                onChange={set("min_naver_reviews")}
                editable unit="개"
              />
              <FilterRow
                label="맛 태그 비율 (후기 대비)"
                value={`${f.min_taste_pct}% 이상`}
                min={0} max={100} step={5}
                v={f.min_taste_pct}
                onChange={set("min_taste_pct")}
              />
              <FilterRow
                label="재방문 비율 (최근 리뷰 기준)"
                value={`${f.min_revisit_pct}% — ${revisitPctToRatio(f.min_revisit_pct)}`}
                min={0} max={60} step={5}
                v={f.min_revisit_pct}
                onChange={set("min_revisit_pct")}
              />
              <p style={{ fontSize: 10.5, color: "var(--sub)", margin: "-6px 0 12px" }}>
                재방문 미측정 가게는 &lsquo;카카오 검증&rsquo;으로 표시돼요.
              </p>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={passOnly}
                  onChange={(e) => setPassOnly(e.target.checked)}
                  style={{ accentColor: "var(--stamp)" }}
                />
                검증된 곳만 보기
              </label>
            </div>
          </aside>

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
                {loading ? "불러오는 중…" : `검증 ${passCount}곳 / 후보 ${scoped.length}곳`}
              </span>
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
                  {search.trim() ? `'${search.trim()}' 검색 결과가 없어요.` : "기준을 통과한 곳이 없어요."}
                </p>
                {search.trim() ? (
                  <button className="btn-ghost" onClick={() => setSearch("")}>검색 지우기</button>
                ) : (
                  <button className="btn-primary" onClick={resetFilters}>기준 초기화</button>
                )}
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              {visible.map((r) => (
                <RestaurantCard key={r.id} r={r} tier={tier(r)} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer style={{ borderTop: "1px solid var(--line)", padding: "26px 0", textAlign: "center" }}>
        <p style={{ fontSize: 11.5, color: "var(--sub)" }}>
          평점·리뷰 데이터 출처: 카카오맵, 네이버 플레이스 (수집 시점 기준이며 실제와 다를 수 있습니다)
        </p>
      </footer>
    </div>
  );
}

function FilterRow({ label, value, min, max, step, v, onChange, editable, unit }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="field-label">{label}</span>
        {editable ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="number"
              min={min}
              step={step}
              value={v}
              onChange={onChange}
              aria-label={`${label} 직접 입력`}
              style={{
                width: 62,
                padding: "3px 8px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--brass)",
                textAlign: "right",
              }}
            />
            <span style={{ fontSize: 11.5, color: "var(--sub)" }}>{unit} 이상</span>
          </span>
        ) : (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--stamp)" }}>{value}</span>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(v, max)} onChange={onChange} aria-label={label} />
    </div>
  );
}

function TypeChip({ r }) {
  const food = typeOf(r) === "food";
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        background: food ? "#fdf0e6" : "#efeafd",
        color: food ? "#b4560f" : "#6d43c9",
      }}
    >
      {food ? "🍜 음식맛집" : "✨ 분위기맛집"}
    </span>
  );
}

function RestaurantCard({ r, tier }) {
  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, color: "var(--sub)" }}>{r.region}</span>
            <TypeChip r={r} />
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
          {r.highlight && (
            <p style={{ fontSize: 13, color: "var(--body)", marginTop: 6 }}>{r.highlight}</p>
          )}
        </div>
        <span
          className={`stamp small ${tier === "fail" ? "fail" : ""}`}
          style={tier === "naver" ? { background: "var(--stamp)", color: "#fff" } : undefined}
          title={
            tier === "naver"
              ? "카카오 + 네이버 재방문까지 전 항목 통과"
              : tier === "kakao"
              ? "카카오 기준 통과 (네이버 재방문 미측정)"
              : "기준 미달"
          }
        >
          {tier === "naver" ? "네이버까지 검증" : tier === "kakao" ? "카카오 검증" : "미달"}
        </span>
      </div>

      <div className="grid-fields">
        <Field label="카카오 평점" value={<span style={{ color: "var(--brass)", fontWeight: 700 }}>★ {Number(r.kakao_rating).toFixed(1)}</span>} />
        <Field label="카카오 리뷰" value={`${Number(r.kakao_reviews).toLocaleString()}개`} />
        <Field label="맛 태그 비율" value={r.taste_pct == null ? "—" : `${r.taste_pct}%`} />
        <Field label="재방문 비율" value={r.revisit_pct == null ? "미측정" : `${r.revisit_pct}%`} />
        <Field label="네이버 평점" value={r.naver_rating ? <span style={{ color: "var(--brass)", fontWeight: 700 }}>★ {Number(r.naver_rating).toFixed(2)}</span> : "—"} />
        <Field label="네이버 리뷰" value={r.naver_reviews ? `${Number(r.naver_reviews).toLocaleString()}개` : "—"} />
        <Field label="주소" value={r.address || "—"} span={2} />
        <Field label="영업시간 (브레이크타임 포함)" value={r.hours || "—"} span={4} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
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
        {r.naver_url && (
          <a href={r.naver_url} target="_blank" rel="noreferrer" style={{ color: "var(--sub)", fontSize: 12, marginLeft: 4 }}>
            네이버 플레이스 ↗
          </a>
        )}
      </div>
    </article>
  );
}

function Field({ label, value, span }) {
  return (
    <div style={span ? { gridColumn: `span ${span}` } : undefined}>
      <div className="field-label">{label}</div>
      <div className="field-value">{value}</div>
    </div>
  );
}
