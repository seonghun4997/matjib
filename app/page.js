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
  TASTE_KEYWORDS,
} from "../lib/constants";

export default function Home() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("전체");
  const [theme, setTheme] = useState("전체");
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

  const passes = (r) =>
    Number(r.kakao_rating) >= f.min_kakao_rating &&
    Number(r.kakao_reviews) >= f.min_kakao_reviews &&
    Number(r.naver_reviews || 0) >= f.min_naver_reviews &&
    Number(r.taste_pct) >= f.min_taste_pct &&
    Number(r.revisit_pct) >= f.min_revisit_pct;

  const inScope = (r) =>
    (region === "전체" || r.region === region) &&
    (theme === "전체" || r.theme === theme);

  const SORTS = {
    rating: (a, b) => Number(b.kakao_rating) - Number(a.kakao_rating),
    revisit: (a, b) => Number(b.revisit_pct) - Number(a.revisit_pct),
    reviews: (a, b) => Number(b.kakao_reviews) - Number(a.kakao_reviews),
  };
  const visible = rows
    .filter(inScope)
    .filter((r) => (passOnly ? passes(r) : true))
    .filter((r) => !search.trim() || r.name.includes(search.trim()) || (r.category || "").includes(search.trim()))
    .sort(SORTS[sort]);
  const passCount = rows.filter(inScope).filter(passes).length;

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
            현재 {regions.length - 1}개 동네 · 검수 통과 {loading ? "…" : passCount}곳
          </span>
        </p>
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
          {/* ── 검수 기준 (필터) ── */}
          <aside
            className="filter-panel card"
            style={{ position: "sticky", top: 20 }}
            aria-label="검수 기준"
          >
            <button
              className="filter-toggle"
              onClick={() => setFilterOpen(!filterOpen)}
              aria-expanded={filterOpen}
            >
              <span>검수 기준 · 통과 {passCount}곳</span>
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

            <NewRegionCrawl
              onDone={(newRegion) => {
                reload();
                setRegion(newRegion);
              }}
            />
            </div>
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

            <div style={{ marginBottom: 24 }} id="map-anchor">
              <MatjibMap places={rows.filter(inScope).filter(passes)} />
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <h2 className="serif" style={{ fontSize: 18, fontWeight: 900 }}>
                {region} 맛집
              </h2>
              <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                {loading ? "불러오는 중…" : `검수 통과 ${passCount}곳 / 후보 ${rows.filter(inScope).length}곳`}
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
                  {search.trim()
                    ? `'${search.trim()}' 검색 결과가 없어요.`
                    : "기준을 통과한 곳이 없어요."}
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

// ─────────────────────────────────────────────
// 방문자용 새 동네 수집 — 안전장치(3일 쿨다운·동시 1건·일 10건)는 서버가 판단
// ─────────────────────────────────────────────
function NewRegionCrawl({ onDone }) {
  const [q, setQ] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);

  const log = (t) => setLogs((l) => [...l.slice(-40), t]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(payload) {
    const r = await fetch("/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `요청 실패 (${r.status})`);
    return j;
  }

  async function run() {
    const region = q.trim();
    if (region.length < 2) return;
    if (!hasSupabase) {
      alert("Supabase 연결 후 사용할 수 있어요.");
      return;
    }
    setRunning(true);
    setLogs([]);
    let jobId = null;

    try {
      log(`'${region}' 수집 준비 중…`);
      const start = await api({ mode: "start", region });
      if (start.blocked) {
        log(start.blocked);
        setRunning(false);
        return;
      }
      jobId = start.jobId;
      const candidates = (start.candidates || []).sort((a, b) => b.favorite - a.favorite);
      log(`후보 ${candidates.length}곳 — 하나씩 검수할게요 (3~5분)`);

      const finals = [];
      let i = 0;
      let consecFails = 0;
      for (const c of candidates) {
        i++;
        if (consecFails >= 3) {
          log("카카오 상세 조회가 연속 실패해서 중단했어요. 관리자 페이지의 [진단]을 실행해 결과를 공유해주세요.");
          break;
        }
        try {
          const d = await api({ mode: "kakao_place", jobId, id: c.id, sample: 50 });
          consecFails = 0;
          if (d.rating < 3.0 || d.reviews < 10) {
            log(`(${i}/${candidates.length}) ${c.name} — 정보 부족, 건너뜀`);
            await sleep(800);
            continue;
          }
          const texts = d.texts || [];
          const hit = texts.filter((t) => TASTE_KEYWORDS.some((k) => t.includes(k))).length;
          const taste = texts.length ? Math.round((hit / texts.length) * 1000) / 10 : 0;

          await sleep(800);
          const n = await api({ mode: "naver_place", jobId, name: c.name, region, recent: 30 });
          if (!n.found) {
            log(`(${i}/${candidates.length}) ${c.name} — 네이버 미확인, 건너뜀`);
            await sleep(800);
            continue;
          }
          log(`(${i}/${candidates.length}) ${c.name} — ★${d.rating} · 맛 ${taste}% · 재방문 ${n.revisit_pct}% ✓`);

          finals.push({
            region,
            name: c.name,
            theme: c.theme || d.theme_fallback || "",
            category: n.category || d.category || c.cate_leaf || "",
            kakao_rating: d.rating,
            kakao_reviews: d.reviews,
            taste_pct: taste,
            naver_rating: n.naver_rating,
            naver_reviews: n.naver_reviews,
            revisit_pct: n.revisit_pct,
            address: n.address || "",
            hours: n.hours || "",
            lat: n.lat,
            lng: n.lng,
            kakao_url: d.kakao_url || "",
            naver_url: n.naver_url || "",
          });
        } catch (e) {
          consecFails++;
          log(`(${i}/${candidates.length}) ${c.name} — 실패: ${e.message}`);
        }
        await sleep(800);
      }

      if (finals.length) {
        const { error } = await supabase.from("restaurants").upsert(finals, { onConflict: "region,name" });
        if (error) throw new Error(`저장 실패: ${error.message}`);
        log(`✓ 완료 — ${finals.length}곳이 추가됐어요. 왼쪽 기준으로 걸러서 보여드릴게요.`);
        onDone && onDone(region);
      } else {
        log("이 동네에서는 수집된 가게가 없어요.");
      }
    } catch (e) {
      log(`중단: ${e.message}`);
    } finally {
      if (jobId) {
        try {
          await api({ mode: "finish", jobId });
        } catch {}
      }
    }
    setRunning(false);
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div className="field-label">찾는 동네가 없나요?</div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !running && run()}
          placeholder="예: 서울 마포구 연남동"
          disabled={running}
          aria-label="새 동네 입력"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "8px 10px",
            border: "1px solid var(--line)",
            borderRadius: 12,
            fontSize: 12.5,
          }}
        />
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: "8px 12px",
            background: running ? "var(--sub)" : "var(--stamp)",
            color: "#fff",
            border: 0,
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {running ? "수집 중" : "수집"}
        </button>
      </div>
      <p style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 6 }}>
        같은 동네는 3일에 한 번, 하루 10개 동네까지 수집할 수 있어요. 수집 중엔 이 탭을 열어두세요.
      </p>
      {logs.length > 0 && (
        <div
          style={{
            background: "var(--paper)",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 11.5,
            lineHeight: 1.7,
            maxHeight: 180,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            marginTop: 8,
          }}
          aria-live="polite"
        >
          {logs.join("\n")}
        </div>
      )}
    </div>
  );
}
