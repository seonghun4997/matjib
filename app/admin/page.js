"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../../lib/supabase";
import { DEFAULT_FILTERS, SITE_NAME, TASTE_KEYWORDS, FOOD_HINTS, MOOD_HINTS } from "../../lib/constants";

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
        {num("min_taste_pct", 5, "맛 태그 비율 (이상)", "% — 후기 100명 중 맛 25명 = 25%")}
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

// 리뷰 텍스트에서 사전 키워드 상위 2개 추출
function topHits(texts, dict) {
  const cnt = {};
  for (const t of texts) for (const k of dict) if (t.includes(k)) cnt[k] = (cnt[k] || 0) + 1;
  return Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 2).map((e) => e[0]);
}

// 음식/분위기 유형에 따라 한 줄 설명 생성
function makeHighlight(d, texts, taste) {
  const isFood = (d.taste_official ?? taste ?? 0) >= (d.mood_official ?? 0);
  if (isFood) {
    const kws = topHits(texts, FOOD_HINTS);
    const menu = (d.menus || [])[0];
    const parts = [];
    if (menu) parts.push(`대표메뉴 ${menu}`);
    if (kws.length) parts.push(`후기에 ${kws.join("·")} 언급이 많아요`);
    return parts.join(" — ");
  }
  const kws = topHits(texts, MOOD_HINTS);
  return kws.length ? `${kws.join("·")} 좋다는 후기가 많아요` : "분위기 좋다는 평가가 많은 곳";
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
  const [skipExisting, setSkipExisting] = useState(true);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [prog, setProg] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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
    setProg(null);
    const kw = keywords.split(",").map((s) => s.trim()).filter(Boolean);
    let savedCount = 0;
    let naverBlocked = false;

    // 이미 수집된 가게 목록 (중복 수집 방지)
    let existing = new Set();
    if (skipExisting) {
      const { data } = await supabase.from("restaurants").select("name").eq("region", region.trim());
      existing = new Set((data || []).map((x) => x.name));
      if (existing.size) log(`이 동네에 이미 ${existing.size}곳이 있어요 — 새 가게만 수집합니다.`);
    }

    try {
      log(`[카카오] '${region} 맛집' 검색 중…`);
      const { candidates } = await api({ mode: "kakao_search", query: `${region} 맛집`, limit: Number(limit) });
      log(`후보 ${candidates.length}곳 발견 (즐겨찾기순 정렬)`);
      candidates.sort((a, b) => b.favorite - a.favorite);

      let i = 0;
      let consecFails = 0;
      for (const c of candidates) {
        i++;
        setProg({ i, total: candidates.length, saved: savedCount });
        if (skipExisting && existing.has(c.name)) {
          log(`(${i}/${candidates.length}) ${c.name} — 이미 수집됨, 건너뜀`);
          continue;
        }
        if (consecFails >= 3) {
          log("카카오 상세 조회가 연속 실패해서 중단했어요. 아래 [진단 실행]을 눌러 결과를 공유해주세요.");
          break;
        }
        try {
          const d = await api({ mode: "kakao_place", id: c.id, sample: 50 });
          const texts = d.texts || [];
          const hit = texts.filter((t) => kw.some((k) => t.includes(k))).length;
          const taste =
            d.taste_official != null ? d.taste_official : texts.length ? Math.round((hit / texts.length) * 1000) / 10 : 0;
          const pass1 = d.rating >= minRating && d.reviews >= minReviews && taste >= minTaste;
          log(`(${i}/${candidates.length}) ${c.name} — ★${d.rating} · 리뷰 ${d.reviews} · 맛 ${taste}% ${pass1 ? "→ 통과" : "→ 제외"}`);
          if (!pass1) {
            await sleep(800);
            continue;
          }

          let n = { found: false, captcha: naverBlocked };
          if (!naverBlocked) {
            await sleep(500);
            try {
              n = await api({ mode: "naver_place", name: c.name, region, recent: Number(recentN), lat: c.lat, lng: c.lng });
            } catch {}
            if (n.captcha) naverBlocked = true;
          }
          log(n.found ? `   네이버: ★${n.naver_rating ?? "?"} · 재방문 ${n.revisit_pct}%` : `   네이버 ${n.captcha ? "차단(캡차)" : "미확인"} → 카카오 정보로 저장`);

          consecFails = 0;
          const row = {
            region,
            name: c.name,
            theme: c.theme || d.theme_fallback || "",
            category: (n.found && n.category) || d.category || c.cate_leaf || "",
            kakao_rating: d.rating,
            kakao_reviews: d.reviews,
            taste_pct: taste,
            mood_pct: d.mood_official ?? null,
            highlight: makeHighlight(d, texts, taste) || null,
            naver_rating: n.found ? n.naver_rating : null,
            naver_reviews: n.found ? n.naver_reviews : null,
            revisit_pct: n.found ? n.revisit_pct : null,
            address: (n.found && n.address) || d.address_hint || "",
            hours: (n.found && n.hours) || d.hours_hint || "",
            lat: (n.found ? n.lat : null) ?? c.lat ?? null,
            lng: (n.found ? n.lng : null) ?? c.lng ?? null,
            kakao_url: d.kakao_url || "",
            naver_url: n.found ? n.naver_url || "" : "",
          };
          const { error } = await supabase.from("restaurants").upsert(row, { onConflict: "region,name" });
          if (error) {
            log(`   저장 실패: ${error.message}`);
          } else {
            savedCount++;
            setProg({ i, total: candidates.length, saved: savedCount });
            if (savedCount % 5 === 0) onDone && onDone();
          }
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
    log("진단 중… (카카오 + 네이버 주소 상태 확인)");
    try {
      const j = await api({ mode: "kakao_debug", query: `${region || "서울 성북동"} 맛집` });
      log("=== 카카오 진단 ===");
      log(JSON.stringify({ search_status: j.search_status, place_id: j.place_id, detail: (j.detail_attempts || []).map((d) => `${d.tag}:${d.status ?? d.error}`) }, null, 2));
    } catch (e) {
      log(`카카오 진단 실패: ${e.message}`);
    }
    try {
      const n = await api({ mode: "naver_debug", query: `성북동 쌍다리돼지불백` });
      log("=== 네이버 진단 ===");
      log(JSON.stringify(n, null, 2));
      log("↑ 이 내용을 전부 복사해서 공유해주세요.");
    } catch (e) {
      log(`네이버 진단 실패: ${e.message}`);
    }
    setRunning(false);
    setProg(null);
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
        지역 입력 후 시작 — 가게마다 즉시 저장돼서 중간에 멈춰도 그때까지는 남아요. 한 동을 전부 훑으려면 후보 수를 100~150으로 올리고, 이어서 돌릴 땐 "이미 수집된 가게 건너뛰기"가 중복을 막아줘요.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div className="field-label">지역</div>
          <input placeholder="예: 서울 마포구 연남동" {...inp(region, setRegion, 220)} disabled={running} />
        </div>
        <div>
          <div className="field-label">후보 수</div>
          <input type="number" min={5} max={150} {...inp(limit, setLimit, 74)} disabled={running} />
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, paddingBottom: 9 }}>
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} disabled={running} style={{ accentColor: "var(--stamp)" }} />
          이미 수집된 가게 건너뛰기
        </label>
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

      {prog && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--sub)", marginBottom: 4 }}>
            <span>검수 {prog.i}/{prog.total}곳</span>
            <span style={{ color: "var(--stamp)", fontWeight: 600 }}>저장 {prog.saved}곳</span>
          </div>
          <div style={{ height: 5, background: "var(--line)", borderRadius: 99 }}>
            <div style={{ height: 5, width: `${Math.round((prog.i / prog.total) * 100)}%`, background: "var(--stamp)", borderRadius: 99, transition: "width 0.3s" }} />
          </div>
        </div>
      )}
      {logs.length > 0 && (
        <div
          ref={logRef}
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
