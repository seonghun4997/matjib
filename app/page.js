"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../lib/supabase";
import MatjibMap from "./MatjibMap";
import {
  SITE_NAME,
  SITE_TAGLINE,
  DEFAULT_FILTERS,
  SAMPLE_RESTAURANTS,
  tastePctToRatio,
  revisitPctToRatio,
} from "../lib/constants";

export default function Home() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("전체");
  const [theme, setTheme] = useState("전체");
  const [passOnly, setPassOnly] = useState(true);
  const [f, setF] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    async function load() {
      if (!hasSupabase) {
        setRows(SAMPLE_RESTAURANTS);
        setLoading(false);
        return;
      }
      const [r, s] = await Promise.all([
        supabase.from("restaurants").select("*").order("kakao_rating", { ascending: false }),
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      ]);
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
    load();
  }, []);

  const regions = useMemo(
    () => ["전체", ...Array.from(new Set(rows.map((r) => r.region))).sort()],
    [rows]
  );

  const themes = useMemo(() => {
    const inRegion = rows.filter((r) => region === "전체" || r.region === region);
    return ["전체", ...Array.from(new Set(inRegion.map((r) => r.theme).filter(Boolean))).sort()];
  }, [rows, region]);

  const passes = (r) =>
    Number(r.kakao_rating) >= f.min_kakao_rating &&
    Number(r.kakao_reviews) >= f.min_kakao_reviews &&
    Number(r.naver_reviews || 0) >= f.min_naver_reviews &&
    Number(r.taste_pct) >= f.min_taste_pct &&
    Number(r.revisit_pct) >= f.min_revisit_pct;

  const inScope = (r) =>
    (region === "전체" || r.region === region) &&
    (theme === "전체" || r.theme === theme);

  const visible = rows.filter(inScope).filter((r) => (passOnly ? passes(r) : true));
  const passCount = rows.filter(inScope).filter(passes).length;

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

      <main className="wrap" style={{ padding: "30px 20px 90px" }}>
        {!hasSupabase && (
          <p
            style={{
              fontSize: 12,
              color: "var(--stamp)",
              background: "var(--stamp-soft)",
              padding: "8px 12px",
              borderRadius: 4,
              marginBottom: 20,
            }}
          >
            지금은 샘플 데이터 모드입니다. Vercel에 Supabase 환경변수를 넣으면 실제 크롤링 데이터가 표시됩니다.
          </p>
        )}

        <div className="layout">
          {/* ── 검수 기준 (필터) ── */}
          <aside
            className="filter-panel card"
            style={{ position: "sticky", top: 20 }}
            aria-label="검수 기준"
          >
            <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>
              검수 기준
            </h2>
            <p style={{ fontSize: 11, color: "var(--sub)", marginBottom: 18 }}>
              기준을 움직이면 바로 걸러져요.
            </p>

            <div style={{ marginBottom: 18 }}>
              <div className="field-label">지역</div>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  background: "#fff",
                  fontSize: 13,
                }}
              >
                {regions.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>

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
              label="맛 관련 리뷰 비율"
              value={`${f.min_taste_pct}% (${tastePctToRatio(f.min_taste_pct)}) 이상`}
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

            <label
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 6, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={passOnly}
                onChange={(e) => setPassOnly(e.target.checked)}
                style={{ accentColor: "var(--stamp)" }}
              />
              통과한 곳만 보기
            </label>
          </aside>

          {/* ── 지도 + 목록 ── */}
          <section aria-label="맛집 지도와 목록">
            <div
              style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
              role="tablist"
              aria-label="카카오 테마"
            >
              {themes.map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  role="tab"
                  aria-selected={theme === t}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    background: theme === t ? "var(--ink)" : "var(--card)",
                    color: theme === t ? "#fff" : "var(--body)",
                    boxShadow: "0 1px 2px rgba(25,31,40,0.04)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 24 }}>
              <MatjibMap places={rows.filter(inScope).filter(passes)} />
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
              <h2 className="serif" style={{ fontSize: 18, fontWeight: 900 }}>
                {region} 맛집
              </h2>
              <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                {loading ? "불러오는 중…" : `검수 통과 ${passCount}곳 / 후보 ${rows.filter(inScope).length}곳`}
              </span>
            </div>

            {!loading && visible.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: "56px 20px", color: "var(--sub)", fontSize: 14 }}>
                기준을 통과한 곳이 없어요. 기준을 낮추거나 다른 지역을 선택해 보세요.
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              {visible.map((r) => (
                <RestaurantCard key={r.id} r={r} pass={passes(r)} />
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(v, max)}
        onChange={onChange}
        aria-label={label}
      />
    </div>
  );
}

function RestaurantCard({ r, pass }) {
  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--sub)", marginBottom: 3 }}>{r.region}</div>
          <h3 className="serif" style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.3 }}>
            {r.name}
            <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sub)", marginLeft: 10, fontFamily: "Pretendard Variable, sans-serif" }}>
              {r.category}
            </span>
            {r.theme && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brass)", background: "var(--stamp-soft)", padding: "3px 9px", borderRadius: 999, marginLeft: 8, verticalAlign: "middle" }}>
                {r.theme}
              </span>
            )}
          </h3>
        </div>
        <span className={`stamp small ${pass ? "" : "fail"}`} title={pass ? "전 항목 통과" : "기준 미달"}>
          {pass ? "통과" : "미달"}
        </span>
      </div>

      <div className="grid-fields">
        <Field label="카카오 평점" value={<span style={{ color: "var(--brass)", fontWeight: 700 }}>★ {Number(r.kakao_rating).toFixed(1)}</span>} />
        <Field label="카카오 리뷰" value={`${Number(r.kakao_reviews).toLocaleString()}개`} />
        <Field label="맛 관련 리뷰 비율" value={`${r.taste_pct}% (${tastePctToRatio(Number(r.taste_pct))})`} />
        <Field label="재방문 비율" value={`${r.revisit_pct}%`} />
        <Field label="네이버 평점" value={r.naver_rating ? <span style={{ color: "var(--brass)", fontWeight: 700 }}>★ {Number(r.naver_rating).toFixed(2)}</span> : "—"} />
        <Field label="네이버 리뷰" value={r.naver_reviews ? `${Number(r.naver_reviews).toLocaleString()}개` : "—"} />
        <Field label="주소" value={r.address || "—"} span={2} />
        <Field label="영업시간 (브레이크타임 포함)" value={r.hours || "—"} span={4} />
      </div>

      {(r.kakao_url || r.naver_url) && (
        <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12 }}>
          {r.kakao_url && (
            <a href={r.kakao_url} target="_blank" rel="noreferrer" style={{ color: "var(--sub)" }}>
              카카오맵에서 열기 ↗
            </a>
          )}
          {r.naver_url && (
            <a href={r.naver_url} target="_blank" rel="noreferrer" style={{ color: "var(--sub)" }}>
              네이버 플레이스에서 열기 ↗
            </a>
          )}
        </div>
      )}
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
