"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../../lib/supabase";
import { DEFAULT_FILTERS, SITE_NAME, TASTE_KEYWORDS } from "../../lib/constants";

// 간단 잠금용 비밀번호 — Vercel 환경변수 NEXT_PUBLIC_ADMIN_PASS 로 변경하세요
const PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";

export default function Admin() {
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!ok || !hasSupabase) return;
    (async () => {
      const [s, r] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("restaurants").select("id,name,region,theme,crawled_at").order("crawled_at", { ascending: false }),
      ]);
      if (s.data)
        setF({
          min_kakao_rating: Number(s.data.min_kakao_rating),
          min_kakao_reviews: Number(s.data.min_kakao_reviews),
          min_naver_reviews: Number(s.data.min_naver_reviews ?? 0),
          min_taste_pct: Number(s.data.min_taste_pct),
          min_revisit_pct: Number(s.data.min_revisit_pct),
        });
      setRows(r.data || []);
    })();
  }, [ok, refresh]);

  async function saveDefaults() {
    if (!hasSupabase) return setMsg("Supabase 연결 후 사용 가능합니다.");
    const { error } = await supabase.from("settings").upsert({ id: 1, ...f });
    setMsg(error ? `저장 실패: ${error.message}` : "기본값이 저장되었습니다. 방문자 화면에 바로 적용됩니다.");
  }

  async function remove(id) {
    if (!confirm("이 가게를 목록에서 삭제할까요?")) return;
    await supabase.from("restaurants").delete().eq("id", id);
    setRows(rows.filter((r) => r.id !== id));
  }

  if (!ok) {
    return (
      <div style={{ maxWidth: 340, margin: "120px auto", padding: 20 }}>
        <h1 className="serif" style={{ fontSize: 20, fontWeight: 900, marginBottom: 14 }}>
          {SITE_NAME} 관리자
        </h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pw === PASS && setOk(true)}
          placeholder="비밀번호"
          style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 14 }}
        />
        <button
          onClick={() => (pw === PASS ? setOk(true) : setMsg("비밀번호가 다릅니다."))}
          style={{ width: "100%", marginTop: 10, padding: "10px 0", background: "var(--ink)", color: "#fff", border: 0, borderRadius: 12, fontSize: 14 }}
        >
          들어가기
        </button>
        {msg && <p style={{ fontSize: 12, color: "var(--stamp)", marginTop: 10 }}>{msg}</p>}
        <Link href="/" style={{ display: "block", marginTop: 18, fontSize: 12, color: "var(--sub)" }}>
          ← 홈으로
        </Link>
      </div>
    );
  }

  const num = (k, step, label, suffix) => (
    <div style={{ marginBottom: 14 }}>
      <div className="field-label">{label}</div>
      <input
        type="number"
        step={step}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })}
        style={{ width: 120, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 14 }}
      />
      <span style={{ fontSize: 12, color: "var(--sub)", marginLeft: 8 }}>{suffix}</span>
    </div>
  );

  return (
    <div className="wrap" style={{ padding: "40px 20px 80px", maxWidth: 760 }}>
      <Link href="/" style={{ fontSize: 12.5, color: "var(--sub)", textDecoration: "none" }}>
        ← 홈으로
      </Link>
      <h1 className="serif" style={{ fontSize: 22, fontWeight: 900, margin: "18px 0 24px" }}>
        관리자
      </h1>

      <CrawlSection pass={pw} onDone={() => setRefresh((x) => x + 1)} />

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 14 }}>
          검수 기준 기본값
        </h2>
        {num("min_kakao_rating", 0.1, "카카오 평점 (이상)", "점")}
        {num("min_kakao_reviews", 5, "카카오 리뷰 수 (이상)", "개")}
        {num("min_naver_reviews", 20, "네이버 리뷰 수 (이상)", "개")}
        {num("min_taste_pct", 5, "맛 관련 리뷰 비율 (이상)", "% — 80% = 4:1")}
        {num("min_revisit_pct", 5, "재방문 비율 (이상)", "% — 20% = 리뷰 5개당 1명")}
        <button
          onClick={saveDefaults}
          style={{ padding: "9px 18px", background: "var(--stamp)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13.5 }}
        >
          기본값 저장
        </button>
        {msg && <p style={{ fontSize: 12.5, color: "var(--stamp)", marginTop: 10 }}>{msg}</p>}
      </section>

      <section className="card">
        <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>
          수집된 가게 ({rows.length})
        </h2>
        <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 14 }}>
          위 크롤링 섹션에서 지역을 추가하면 여기에 쌓입니다.
        </p>
        {!hasSupabase && <p style={{ fontSize: 13, color: "var(--sub)" }}>Supabase 연결 후 표시됩니다.</p>}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}
          >
            <span>
              {r.name}{" "}
              <span style={{ color: "var(--sub)", fontSize: 12 }}>
                · {r.region}
                {r.theme ? ` · ${r.theme}` : ""}
              </span>
            </span>
            <button onClick={() => remove(r.id)} style={{ background: "none", border: 0, color: "var(--stamp)", fontSize: 12.5 }}>
              삭제
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────
// 웹 크롤링 섹션 — 파이썬 없이 사이트 안에서 수집
// ─────────────────────────────────────────────
function CrawlSection({ pass, onDone }) {
  const [region, setRegion] = useState("");
  const [limit, setLimit] = useState(20);
  const [minRating, setMinRating] = useState(3.5);
  const [minReviews, setMinReviews] = useState(30);
  const [minTaste, setMinTaste] = useState(60);
  const [recentN, setRecentN] = useState(30);
  const [keywords, setKeywords] = useState(TASTE_KEYWORDS.join(", "));
  const [showKw, setShowKw] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);

  const log = (t) => setLogs((l) => [...l, t]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(payload) {
    const r = await fetch("/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass, ...payload }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `요청 실패 (${r.status})`);
    return j;
  }

  async function run() {
    if (!region.trim()) return alert("지역을 입력하세요. 예: 서울 마포구 연남동");
    if (!hasSupabase) return alert("Supabase 연결 후 사용 가능합니다.");
    setRunning(true);
    setLogs([]);
    const kw = keywords.split(",").map((s) => s.trim()).filter(Boolean);
    const finals = [];

    try {
      log(`[카카오] '${region} 맛집' 검색 중…`);
      const { candidates } = await api({ mode: "kakao_search", query: `${region} 맛집`, limit: Number(limit) });
      log(`후보 ${candidates.length}곳 발견 (즐겨찾기순 정렬)`);
      candidates.sort((a, b) => b.favorite - a.favorite);

      let i = 0;
      let consecFails = 0;
      for (const c of candidates) {
        i++;
        if (consecFails >= 3) {
          log("카카오 상세 조회가 연속 실패해서 중단했어요. 아래 [진단 실행]을 눌러 결과를 공유해주세요.");
          break;
        }
        try {
          const d = await api({ mode: "kakao_place", id: c.id, sample: 50 });
          consecFails = 0;
          const texts = d.texts || [];
          const hit = texts.filter((t) => kw.some((k) => t.includes(k))).length;
          const taste = texts.length ? Math.round((hit / texts.length) * 1000) / 10 : 0;
          const pass1 = d.rating >= minRating && d.reviews >= minReviews && taste >= minTaste;
          log(`(${i}/${candidates.length}) ${c.name} — ★${d.rating} · 리뷰 ${d.reviews} · 맛 ${taste}% ${pass1 ? "→ 통과" : "→ 제외"}`);
          if (!pass1) {
            await sleep(800);
            continue;
          }

          await sleep(800);
          const n = await api({ mode: "naver_place", name: c.name, region, recent: Number(recentN) });
          if (!n.found) {
            log(`   네이버에서 못 찾음 — 건너뜀`);
            await sleep(800);
            continue;
          }
          log(`   네이버: ${n.category || "?"} · ★${n.naver_rating ?? "?"} · 재방문 ${n.revisit_pct}%`);

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
          log(`   ! ${c.name} 실패: ${e.message}`);
        }
        await sleep(800);
      }

      if (finals.length) {
        const { error } = await supabase.from("restaurants").upsert(finals, { onConflict: "region,name" });
        if (error) throw new Error(`저장 실패: ${error.message}`);
        log(`✓ 완료 — ${finals.length}곳 저장. 사이트에 바로 반영됐어요.`);
        onDone && onDone();
      } else {
        log("통과한 가게가 없어요. 맛 비율 기준을 낮춰서 다시 시도해보세요.");
      }
    } catch (e) {
      log(`! 중단: ${e.message}`);
    }
    setRunning(false);
  }

  async function diagnose() {
    setRunning(true);
    setLogs([]);
    log("진단 중… (카카오 검색 1회 + 상세 주소 3종 상태 확인)");
    try {
      const j = await api({ mode: "kakao_debug", query: `${region || "서울 성북동"} 맛집` });
      log(JSON.stringify(j, null, 2));
      log("↑ 이 내용을 전부 복사해서 공유해주세요.");
    } catch (e) {
      log(`진단 실패: ${e.message}`);
    }
    setRunning(false);
  }

  const inp = (v, set, w) => ({
    value: v,
    onChange: (e) => set(e.target.value),
    style: { width: w, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 13.5 },
  });

  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>
        크롤링 (사이트에서 바로 수집)
      </h2>
      <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 14 }}>
        지역을 입력하고 시작을 누르면 카카오맵 → 네이버 순서로 수집해요. 가게당 몇 초씩, 후보 20곳 기준 5분 안팎.
        실행 중에는 이 탭을 닫지 마세요.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div className="field-label">지역</div>
          <input placeholder="예: 서울 마포구 연남동" {...inp(region, setRegion, 220)} disabled={running} />
        </div>
        <div>
          <div className="field-label">후보 수</div>
          <input type="number" min={5} max={45} {...inp(limit, setLimit, 74)} disabled={running} />
        </div>
        <div>
          <div className="field-label">평점 ≥</div>
          <input type="number" step={0.1} {...inp(minRating, setMinRating, 74)} disabled={running} />
        </div>
        <div>
          <div className="field-label">리뷰 ≥</div>
          <input type="number" step={5} {...inp(minReviews, setMinReviews, 74)} disabled={running} />
        </div>
        <div>
          <div className="field-label">맛 비율 % ≥</div>
          <input type="number" step={5} {...inp(minTaste, setMinTaste, 74)} disabled={running} />
        </div>
        <div>
          <div className="field-label">최근 리뷰 수</div>
          <input type="number" step={5} {...inp(recentN, setRecentN, 74)} disabled={running} />
        </div>
        <button
          onClick={run}
          disabled={running}
          style={{
            padding: "9px 20px",
            background: running ? "var(--sub)" : "var(--stamp)",
            color: "#fff",
            border: 0,
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          {running ? "수집 중…" : "크롤링 시작"}
        </button>
        <button
          onClick={diagnose}
          disabled={running}
          style={{ padding: "9px 14px", background: "var(--paper)", color: "var(--body)", border: 0, borderRadius: 12, fontSize: 13 }}
        >
          진단 실행
        </button>
      </div>

      <button
        onClick={() => setShowKw(!showKw)}
        style={{ background: "none", border: 0, color: "var(--sub)", fontSize: 12, padding: 0, marginBottom: 8 }}
      >
        {showKw ? "▾ 맛 키워드 접기" : "▸ 맛 키워드 편집 (쉼표로 구분)"}
      </button>
      {showKw && (
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          rows={3}
          disabled={running}
          style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 12, fontSize: 12.5, marginBottom: 10, fontFamily: "inherit" }}
        />
      )}

      {logs.length > 0 && (
        <div
          style={{
            background: "var(--paper)",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 12,
            lineHeight: 1.8,
            maxHeight: 260,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {logs.join("\n")}
        </div>
      )}
    </section>
  );
}
