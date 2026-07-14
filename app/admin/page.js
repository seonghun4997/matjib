"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../../lib/supabase";
import { DEFAULT_FILTERS, SITE_NAME, TASTE_KEYWORDS, FOOD_HINTS, MOOD_HINTS } from "../../lib/constants";

const PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";

export default function Admin() {
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState("crawl");
  const [recalcing, setRecalcing] = useState(false);
  const [recalcLog, setRecalcLog] = useState("");

  useEffect(() => {
    if (!ok || !hasSupabase) return;
    (async () => {
      const [s, r] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
        supabase
          .from("restaurants")
          .select("id,name,region,theme,taste_pct,mood_pct,revisit_pct,suspect_score,suspect_reasons,hidden,kakao_url,crawled_at")
          .order("crawled_at", { ascending: false }),
      ]);
      if (s.data)
        setF({
          min_kakao_rating: Number(s.data.min_kakao_rating),
          min_kakao_reviews: Number(s.data.min_kakao_reviews),
          min_naver_reviews: Number(s.data.min_naver_reviews ?? 0),
          min_taste_pct: Number(s.data.min_taste_pct),
          min_mood_pct: Number(s.data.min_mood_pct ?? 25),
          min_revisit_pct: Number(s.data.min_revisit_pct),
          suspect_hide_score: Number(s.data.suspect_hide_score ?? 60),
        });
      setRows(r.data || []);
    })();
  }, [ok, refresh]);

  async function saveDefaults() {
    if (!hasSupabase) return setMsg("Supabase 연결 후 사용 가능합니다.");
    const { error } = await supabase.from("settings").upsert({ id: 1, ...f });
    setMsg(error ? `저장 실패: ${error.message}` : "저장 완료 — 수집과 홈 화면에 동일하게 적용됩니다.");
  }

  async function toggleHidden(r) {
    await supabase.from("restaurants").update({ hidden: !r.hidden }).eq("id", r.id);
    setRows(rows.map((x) => (x.id === r.id ? { ...x, hidden: !r.hidden } : x)));
  }

  // 기존 가게 전체 의심도 재계산 (재수집 없이)
  async function recalcSuspect() {
    const targets = rows.filter((r) => r.kakao_url);
    if (!targets.length) return alert("재계산할 가게가 없어요.");
    if (!confirm(`${targets.length}곳의 의심도를 다시 계산할까요? (약 ${Math.ceil(targets.length * 1.2 / 60)}분)`)) return;
    setRecalcing(true);
    let done = 0;
    let flagged = 0;
    for (const r0 of targets) {
      const id = (r0.kakao_url.match(/place\.map\.kakao\.com\/(\d+)/) || [])[1];
      if (!id) continue;
      try {
        const res = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pass: pw, mode: "kakao_place", id, sample: 50 }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || res.status);
        const score = d.suspect_score || 0;
        const patch = { suspect_score: score, suspect_reasons: d.suspect_reasons || null };
        if (score >= f.suspect_hide_score) patch.hidden = true; // 자동숨김만 적용, 수동 해제분은 건드리지 않음
        await supabase.from("restaurants").update(patch).eq("id", r0.id);
        done++;
        if (score >= f.suspect_hide_score) flagged++;
        setRecalcLog(`재계산 중 ${done}/${targets.length} · 자동숨김 ${flagged}곳 · 최근: ${r0.name} ${score}점`);
      } catch (e) {
        setRecalcLog(`${r0.name} 오류: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    setRecalcLog(`✓ 완료 — ${done}곳 재계산, ${flagged}곳 자동숨김`);
    setRefresh((x) => x + 1);
    setRecalcing(false);
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
    <div className="wrap" style={{ padding: "40px 20px 80px", maxWidth: 780 }}>
      <Link href="/" style={{ fontSize: 12.5, color: "var(--sub)", textDecoration: "none" }}>
        ← 홈으로
      </Link>
      <h1 className="serif" style={{ fontSize: 22, fontWeight: 900, margin: "18px 0 16px" }}>
        관리자
      </h1>

      <div
        style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--paper)", display: "flex", gap: 6, padding: "8px 0 14px", flexWrap: "wrap" }}
        role="tablist"
        aria-label="관리자 메뉴"
      >
        {[
          ["criteria", "① 기준"],
          ["crawl", "② 수집"],
          ["verify", `③ 네이버 검증${rows.filter((r) => r.revisit_pct == null).length ? ` (${rows.filter((r) => r.revisit_pct == null).length})` : ""}`],
          ["manage", `④ 가게 관리 (${rows.length})`],
        ].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            role="tab"
            aria-selected={tab === v}
            style={{
              padding: "9px 15px",
              borderRadius: 999,
              border: 0,
              fontSize: 13,
              fontWeight: 600,
              background: tab === v ? "var(--stamp)" : "var(--card)",
              color: tab === v ? "#fff" : "var(--body)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "criteria" && (
      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>
          ① 검수 기준 <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sub)" }}>— 수집과 홈 노출에 똑같이 적용</span>
        </h2>
        <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 14 }}>
          여기 저장한 값이 유일한 기준이에요. 수집할 때도, 홈에서 보여줄 때도 이 값으로 판단합니다.
        </p>
        {num("min_kakao_rating", 0.1, "카카오 평점 (이상)", "점")}
        {num("min_kakao_reviews", 5, "카카오 리뷰 수 (이상)", "개")}
        {num("min_taste_pct", 5, "맛 태그 비율 (이상)", "% — 음식맛집 기준")}
        {num("min_mood_pct", 5, "분위기 태그 비율 (이상)", "% — 분위기맛집 기준")}
        {num("min_revisit_pct", 5, "재방문 비율 (이상)", "% — 최근 20개 중 4개 = 20%. '무조건 맛집 보장' 배지 기준")}
        {num("suspect_hide_score", 5, "조작 의심 자동 숨김 (이상)", "점 — 의심도가 이 점수 이상이면 수집 시 자동으로 고객 화면에서 숨김")}
        <button
          onClick={saveDefaults}
          style={{ padding: "9px 18px", background: "var(--stamp)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13.5 }}
        >
          기준 저장
        </button>
        {msg && <p style={{ fontSize: 12.5, color: "var(--stamp)", marginTop: 10 }}>{msg}</p>}
      </section>
      )}

      {tab === "crawl" && <CrawlSection pass={pw} f={f} onDone={() => setRefresh((x) => x + 1)} />}

      {tab === "verify" && (
        <NaverVerifyPanel refresh={refresh} minRevisit={f.min_revisit_pct} onDone={() => setRefresh((x) => x + 1)} />
      )}

      {tab === "manage" && (
      <section className="card">
        <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>
          ④ 수집된 가게 ({rows.length})
        </h2>
        <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 12 }}>
          의심도(0~100점)는 ① 특정 시기에 평균별점 4.9~5.0 리뷰어 집중 ② 맛/분위기 태그 비율 과다 — 두 기준으로 계산돼요.
          {f.suspect_hide_score}점 이상은 수집 때 자동 숨김되고, 배지에 마우스를 올리면 근거가 보여요. 오판이면 [표시]로 되살리세요.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <button
            onClick={recalcSuspect}
            disabled={recalcing}
            style={{ padding: "8px 14px", background: recalcing ? "var(--sub)" : "var(--ink)", color: "#fff", border: 0, borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}
          >
            {recalcing ? "재계산 중…" : "⚠️ 의심도 전체 재계산"}
          </button>
          {recalcLog && <span style={{ fontSize: 12, color: "var(--sub)" }}>{recalcLog}</span>}
        </div>
        {!hasSupabase && <p style={{ fontSize: 13, color: "var(--sub)" }}>Supabase 연결 후 표시됩니다.</p>}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}
          >
            <span style={{ opacity: r.hidden ? 0.45 : 1 }}>
              {Number(r.taste_pct ?? 0) >= Number(r.mood_pct ?? 0) ? "🍜" : "✨"} {r.name}{" "}
              <span style={{ color: "var(--sub)", fontSize: 12 }}>
                · {r.region}
                {r.theme ? ` · ${r.theme}` : ""}
                {r.revisit_pct != null ? ` · 재방문 ${r.revisit_pct}%` : " · 네이버 미검증"}
              </span>
              {r.suspect_score > 0 && (
                <span
                  title={r.suspect_reasons || ""}
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    color: r.suspect_score >= 60 ? "#b91c1c" : "#b45309",
                    background: r.suspect_score >= 60 ? "#fdeaea" : "#fdf0e0",
                    padding: "2px 8px",
                    borderRadius: 999,
                    cursor: "help",
                  }}
                >
                  ⚠️ 의심도 {r.suspect_score}점
                </span>
              )}
              {r.hidden && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--sub)" }}>(숨김)</span>}
            </span>
            <span style={{ display: "inline-flex", gap: 10, flexShrink: 0 }}>
              <button onClick={() => toggleHidden(r)} style={{ background: "none", border: 0, color: "var(--sub)", fontSize: 12.5 }}>
                {r.hidden ? "표시" : "숨김"}
              </button>
              <button onClick={() => remove(r.id)} style={{ background: "none", border: 0, color: "var(--stamp)", fontSize: 12.5 }}>
                삭제
              </button>
            </span>
          </div>
        ))}
      </section>
      )}
    </div>
  );
}

function topHits(texts, dict) {
  const cnt = {};
  for (const t of texts) for (const k of dict) if (t.includes(k)) cnt[k] = (cnt[k] || 0) + 1;
  return Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 2).map((e) => e[0]);
}

// 한 줄 설명 — 통계 문구 없이, 두 유형이면 둘 다 반영 (항상 최소 한 줄)
function makeHighlight(d, texts, foodOk, moodOk) {
  const parts = [];
  const menu = foodOk ? (d.menus || [])[0] : null;
  if (menu) parts.push(`대표메뉴 ${menu}`);
  if (foodOk && moodOk) parts.push("맛과 분위기 모두 호평");
  const kws = [...(foodOk ? topHits(texts, FOOD_HINTS) : []), ...(moodOk ? topHits(texts, MOOD_HINTS) : [])].slice(0, 3);
  if (kws.length) parts.push(`${kws.join("·")} 언급이 많아요`);
  if (!parts.length) parts.push(foodOk ? "'맛' 평가가 좋은 곳" : "분위기 좋다는 후기가 많은 곳");
  return parts.join(" · ");
}

// ─────────────────────────────────────────────
// ② 수집 — 카카오 전용, 동 전체를 끝까지 검수
// ─────────────────────────────────────────────
function CrawlSection({ pass, f, onDone }) {
  const [region, setRegion] = useState("");
  const [requests, setRequests] = useState([]);
  const stopRef = useRef(false);
  const [queue, setQueue] = useState(null); // { total, done, current }
  const [collectType, setCollectType] = useState("both");
  const [skipExisting, setSkipExisting] = useState(true);
  const [keywords, setKeywords] = useState(TASTE_KEYWORDS.join(", "));
  const [showKw, setShowKw] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [prog, setProg] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // 고객이 요청한 동네 불러오기
  useEffect(() => {
    if (!hasSupabase) return;
    (async () => {
      const { data } = await supabase
        .from("region_requests")
        .select("id,region,count")
        .eq("status", "pending")
        .order("count", { ascending: false });
      setRequests(data || []);
    })();
  }, [running]);

  // 수집 중 새로고침/닫기 경고 (저장은 가게 단위라 잃는 건 이후 분량뿐)
  useEffect(() => {
    if (!running) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

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

  // 줄바꿈/쉼표로 여러 지역 입력 → 큐로 순차 수집
  async function run() {
    const regions = region
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!regions.length) return alert("지역을 입력하세요. 예: 서울 성북구 성북동");
    if (!hasSupabase) return alert("Supabase 연결 후 사용 가능합니다.");

    stopRef.current = false;
    setRunning(true);
    setLogs([]);
    setProg(null);
    let grandTotal = 0;

    for (let qi = 0; qi < regions.length; qi++) {
      if (stopRef.current) {
        log(`■ 중단됨 — 여기까지 저장된 ${grandTotal}곳은 모두 반영됐어요.`);
        break;
      }
      setQueue({ total: regions.length, done: qi, current: regions[qi] });
      if (regions.length > 1) log(`\n===== [${qi + 1}/${regions.length}] ${regions[qi]} =====`);
      const saved = await runOne(regions[qi]);
      grandTotal += saved;
      // 고객 요청 동네였다면 완료 처리
      const req = requests.find((x) => x.region === regions[qi] || regions[qi].includes(x.region));
      if (req && saved > 0) {
        await supabase.from("region_requests").update({ status: "done" }).eq("id", req.id);
      }
      onDone && onDone();
    }

    if (!stopRef.current && regions.length > 1) log(`\n✓ 전체 완료 — 총 ${grandTotal}곳 저장`);
    setQueue(null);
    setRunning(false);
    setProg(null);
  }

  async function runOne(region) {
    const kw = keywords.split(",").map((s) => s.trim()).filter(Boolean);
    let savedCount = 0;

    let existing = new Set();
    if (skipExisting) {
      const { data } = await supabase.from("restaurants").select("name").eq("region", region.trim());
      existing = new Set((data || []).map((x) => x.name));
      if (existing.size) log(`이미 ${existing.size}곳 있음 — 새 가게만 검수합니다.`);
    }

    try {
      log(`[카카오] '${region} 맛집' — 검색 결과 끝까지 수집합니다…`);
      const { candidates } = await api({ mode: "kakao_search", query: `${region} 맛집` });
      log(
        `후보 ${candidates.length}곳 · 기준: ★${f.min_kakao_rating}/리뷰 ${f.min_kakao_reviews}/맛 ${f.min_taste_pct}%/분위기 ${f.min_mood_pct}% · 유형: ${
          collectType === "both" ? "음식+분위기" : collectType === "food" ? "음식맛집만" : "분위기맛집만"
        }`
      );
      candidates.sort((a, b) => b.favorite - a.favorite);

      let i = 0;
      let consecFails = 0;
      for (const c of candidates) {
        if (stopRef.current) {
          log(`■ 중단 — ${region}에서 ${savedCount}곳 저장 완료 (모두 반영됨)`);
          break;
        }
        i++;
        setProg({ i, total: candidates.length, saved: savedCount });
        if (!c.name || !c.id) continue;
        if (skipExisting && existing.has(c.name)) {
          log(`(${i}/${candidates.length}) ${c.name} — 이미 수집됨, 건너뜀`);
          continue;
        }
        if (consecFails >= 3) {
          log("카카오 조회가 연속 실패해서 중단했어요. [진단 실행] 결과를 공유해주세요.");
          break;
        }
        try {
          const d = await api({ mode: "kakao_place", id: c.id, sample: 50 });
          const texts = d.texts || [];
          const hit = texts.filter((t) => kw.some((k) => t.includes(k))).length;
          const taste =
            d.taste_official != null ? d.taste_official : texts.length ? Math.round((hit / texts.length) * 1000) / 10 : 0;
          const mood = d.mood_official ?? 0;

          const foodOk = taste >= f.min_taste_pct;
          const moodOk = mood >= f.min_mood_pct;
          const typeOk = collectType === "both" ? foodOk || moodOk : collectType === "food" ? foodOk : moodOk;
          const pass1 = d.rating >= f.min_kakao_rating && d.reviews >= f.min_kakao_reviews && typeOk;
          const kind = foodOk && moodOk ? "음식+분위기" : foodOk ? "음식" : "분위기";
          const autoHide = (d.suspect_score || 0) >= f.suspect_hide_score;
          const susNote = d.suspect_score > 0 ? ` ⚠️의심 ${d.suspect_score}점${autoHide ? "→자동숨김" : ""}` : "";
          log(
            `(${i}/${candidates.length}) ${c.name} — ★${d.rating} · 리뷰 ${d.reviews} · 맛 ${taste}% · 분위기 ${mood}%${susNote} ${
              pass1 ? `→ ${kind}맛집 저장` : "→ 제외"
            }`
          );
          consecFails = 0;
          if (!pass1) {
            await sleep(500);
            continue;
          }

          const row = {
            region: region.trim(),
            name: c.name,
            theme: c.theme || d.theme_fallback || "",
            category: d.category || c.cate_leaf || "",
            kakao_rating: d.rating,
            kakao_reviews: d.reviews,
            taste_pct: taste,
            mood_pct: d.mood_official ?? null,
            highlight: makeHighlight(d, texts, foodOk, moodOk) || null,
            naver_rating: null,
            naver_reviews: null,
            revisit_pct: null,
            address: d.address_hint || "",
            hours: d.hours_hint || "",
            lat: c.lat ?? null,
            lng: c.lng ?? null,
            kakao_url: d.kakao_url || "",
            naver_url: "",
            suspect_score: d.suspect_score || 0,
            suspect_reasons: d.suspect_reasons || null,
            hidden: autoHide,
          };
          let { error } = await supabase.from("restaurants").upsert(row, { onConflict: "region,name" });
          if (error) {
            await sleep(1200);
            ({ error } = await supabase.from("restaurants").upsert(row, { onConflict: "region,name" }));
          }
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
        await sleep(500);
      }

      log(savedCount ? `✓ ${region} 완료 — 새로 ${savedCount}곳 저장` : `${region}: 새로 저장된 가게 없음 (기준 조정 또는 이미 수집됨)`);
    } catch (e) {
      log(`! ${region} 오류: ${e.message}`);
    }
    return savedCount;
  }

  async function diagnose() {
    setRunning(true);
    setLogs([]);
    log("진단 중… (카카오 검색 + 상세 주소 상태 확인)");
    try {
      const j = await api({ mode: "kakao_debug", query: `${region || "서울 성북동"} 맛집` });
      log(JSON.stringify(j, null, 2));
      log("↑ 이 내용을 전부 복사해서 공유해주세요.");
    } catch (e) {
      log(`진단 실패: ${e.message}`);
    }
    setRunning(false);
  }

  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>
        ② 수집 <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sub)" }}>— 카카오맵에서 동 전체 검수</span>
      </h2>
      <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 14 }}>
        여러 동네를 줄바꿈으로 입력하면 자동으로 순차 수집해요. 가게마다 즉시 저장되니 [중단]하거나 창을 닫아도
        그때까지 저장된 건 모두 반영됩니다. 맛·분위기 기준을 둘 다 넘는 가게는 두 유형 모두로 표시돼요.
      </p>

      {requests.length > 0 && (
        <div style={{ background: "var(--stamp-soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brass)" }}>
              🙋 고객이 요청한 동네 {requests.length}곳
            </span>
            <button
              onClick={() => setRegion(requests.map((r) => r.region).join("\n"))}
              disabled={running}
              style={{ padding: "7px 13px", background: "var(--stamp)", color: "#fff", border: 0, borderRadius: 10, fontSize: 12, fontWeight: 600 }}
            >
              전부 아래에 넣기
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--body)", marginTop: 6 }}>
            {requests.map((r) => `${r.region}${r.count > 1 ? ` (${r.count}명)` : ""}`).join(" · ")}
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="field-label">지역 (여러 줄 = 자동 순차 수집)</div>
          <textarea
            placeholder={"서울 성북구 성북동\n서울 마포구 연남동\n서울 성동구 성수동"}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={running}
            rows={3}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 13.5, fontFamily: "inherit", resize: "vertical" }}
          />
        </div>
        <div>
          <div className="field-label">수집 유형</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              ["both", "둘 다"],
              ["food", "🍜 음식만"],
              ["mood", "✨ 분위기만"],
            ].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setCollectType(v)}
                disabled={running}
                style={{
                  padding: "8px 11px",
                  borderRadius: 10,
                  border: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  background: collectType === v ? "var(--stamp)" : "var(--paper)",
                  color: collectType === v ? "#fff" : "var(--body)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {running ? (
          <button
            onClick={() => {
              stopRef.current = true;
              log("■ 중단 요청 — 진행 중인 가게까지 저장하고 멈춥니다…");
            }}
            style={{ padding: "9px 20px", background: "#b91c1c", color: "#fff", border: 0, borderRadius: 12, fontSize: 13.5, fontWeight: 600 }}
          >
            중단
          </button>
        ) : (
          <button
            onClick={run}
            style={{ padding: "9px 20px", background: "var(--stamp)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13.5, fontWeight: 600 }}
          >
            수집 시작
          </button>
        )}
        <button
          onClick={diagnose}
          disabled={running}
          style={{ padding: "9px 14px", background: "var(--paper)", color: "var(--body)", border: 0, borderRadius: 12, fontSize: 13 }}
        >
          진단 실행
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} disabled={running} style={{ accentColor: "var(--stamp)" }} />
          이미 수집된 가게 건너뛰기
        </label>
        <button onClick={() => setShowKw(!showKw)} style={{ background: "none", border: 0, color: "var(--sub)", fontSize: 12, padding: 0 }}>
          {showKw ? "▾ 맛 키워드 접기" : "▸ 맛 키워드 편집"}
        </button>
      </div>
      {showKw && (
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          rows={3}
          disabled={running}
          style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 12, fontSize: 12.5, marginBottom: 10, fontFamily: "inherit" }}
        />
      )}

      {queue && queue.total > 1 && (
        <p style={{ fontSize: 12, color: "var(--stamp)", fontWeight: 600, marginBottom: 6 }}>
          지역 {queue.done + 1}/{queue.total} — {queue.current}
        </p>
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
          style={{ background: "var(--paper)", borderRadius: 12, padding: "12px 14px", fontSize: 12, lineHeight: 1.8, maxHeight: 260, overflowY: "auto", whiteSpace: "pre-wrap" }}
        >
          {logs.join("\n")}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// ③ 네이버 수기 검증 — 알바생용
// ─────────────────────────────────────────────
function NaverVerifyPanel({ refresh, minRevisit, onDone }) {
  const [pending, setPending] = useState([]);
  const [counts, setCounts] = useState({});
  const [savedMsg, setSavedMsg] = useState("");
  const [regionFilter, setRegionFilter] = useState("전체");

  useEffect(() => {
    if (!hasSupabase) return;
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id,name,region,naver_url")
        .is("revisit_pct", null)
        .order("crawled_at", { ascending: false })
        .limit(300);
      setPending(data || []);
    })();
  }, [refresh]);

  async function save(r) {
    const raw = counts[r.id];
    if (raw === undefined || raw === "") return alert("재방문 개수를 입력하세요 (0~20)");
    const cnt = Math.max(0, Math.min(20, Number(raw)));
    const pct = cnt * 5;
    const { error } = await supabase.from("restaurants").update({ revisit_pct: pct }).eq("id", r.id);
    if (error) return alert(`저장 실패: ${error.message}`);
    setPending(pending.filter((x) => x.id !== r.id));
    setSavedMsg(
      `${r.name}: 재방문 ${cnt}개 (${pct}%) 저장 — ${pct >= minRevisit ? "'무조건 맛집 보장' 배지가 붙어요 ✓" : "기준 미달이라 '맛집일 확률 높음'으로 유지돼요"}`
    );
    onDone && onDone();
  }

  const naverLink = (r) =>
    r.naver_url || `https://map.naver.com/p/search/${encodeURIComponent(`${(r.region || "").split(" ").pop()} ${r.name}`)}`;

  const shown = pending.filter((r) => regionFilter === "전체" || r.region === regionFilter);

  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>
        ③ 네이버 검증 <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sub)" }}>— 수기 확인, 대기 {pending.length}곳</span>
      </h2>
      <ol style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.9, margin: "0 0 14px 18px" }}>
        <li>[네이버 리뷰 열기]를 눌러 가게를 찾고, 리뷰 탭 → <b>최신순</b>으로 바꿔요</li>
        <li>최근 리뷰 <b>20개</b>에서 &ldquo;<b>N번째 방문</b>&rdquo; 표시가 붙은 리뷰 개수를 세요</li>
        <li>개수 입력 → 저장 — 기준({minRevisit}% = 20개 중 {Math.ceil(minRevisit / 5)}개) 이상이면 홈에 &lsquo;무조건 맛집 보장&rsquo; 배지가 자동으로 붙어요</li>
      </ol>
      {savedMsg && <p style={{ fontSize: 12.5, color: "var(--stamp)", marginBottom: 10 }}>{savedMsg}</p>}
      {pending.length > 0 && (
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5, marginBottom: 10 }}
          aria-label="검증 대기 지역 필터"
        >
          {["전체", ...Array.from(new Set(pending.map((x) => x.region)))].map((rg) => (
            <option key={rg}>{rg}</option>
          ))}
        </select>
      )}
      {pending.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>검증 대기 중인 가게가 없어요 🎉</p>}
      {shown.map((r) => (
        <div
          key={r.id}
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}
        >
          <span style={{ flex: 1, minWidth: 160 }}>
            {r.name} <span style={{ color: "var(--sub)", fontSize: 12 }}>· {r.region}</span>
          </span>
          <a href={naverLink(r)} target="_blank" rel="noreferrer" className="btn-ghost" style={{ fontSize: 12, padding: "7px 12px" }}>
            네이버 리뷰 열기 ↗
          </a>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
            재방문
            <input
              type="number"
              min={0}
              max={20}
              value={counts[r.id] ?? ""}
              onChange={(e) => setCounts({ ...counts, [r.id]: e.target.value })}
              style={{ width: 54, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, textAlign: "center" }}
              aria-label={`${r.name} 재방문 개수`}
            />
            /20
          </span>
          <button
            onClick={() => save(r)}
            style={{ padding: "7px 14px", background: "var(--stamp)", color: "#fff", border: 0, borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}
          >
            저장
          </button>
        </div>
      ))}
    </section>
  );
}
