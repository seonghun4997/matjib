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
        supabase
          .from("restaurants")
          .select("id,name,region,theme,taste_pct,mood_pct,revisit_pct,crawled_at")
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
        });
      setRows(r.data || []);
    })();
  }, [ok, refresh]);

  async function saveDefaults() {
    if (!hasSupabase) return setMsg("Supabase 연결 후 사용 가능합니다.");
    const { error } = await supabase.from("settings").upsert({ id: 1, ...f });
    setMsg(error ? `저장 실패: ${error.message}` : "저장 완료 — 수집과 홈 화면에 동일하게 적용됩니다.");
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
      <h1 className="serif" style={{ fontSize: 22, fontWeight: 900, margin: "18px 0 24px" }}>
        관리자
      </h1>

      {/* ── ① 검수 기준 (수집·노출 공통) ── */}
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
        {num("min_revisit_pct", 5, "재방문 비율 (이상)", "% — 최근 20개 중 4개 = 20%. '네이버까지 검증' 배지 기준")}
        <button
          onClick={saveDefaults}
          style={{ padding: "9px 18px", background: "var(--stamp)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13.5 }}
        >
          기준 저장
        </button>
        {msg && <p style={{ fontSize: 12.5, color: "var(--stamp)", marginTop: 10 }}>{msg}</p>}
      </section>

      {/* ── ② 수집 ── */}
      <CrawlSection pass={pw} f={f} onDone={() => setRefresh((x) => x + 1)} />

      {/* ── ③ 네이버 수기 검증 ── */}
      <NaverVerifyPanel refresh={refresh} minRevisit={f.min_revisit_pct} onDone={() => setRefresh((x) => x + 1)} />

      {/* ── ④ 수집된 가게 ── */}
      <section className="card">
        <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>
          ④ 수집된 가게 ({rows.length})
        </h2>
        {!hasSupabase && <p style={{ fontSize: 13, color: "var(--sub)" }}>Supabase 연결 후 표시됩니다.</p>}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}
          >
            <span>
              {Number(r.taste_pct ?? 0) >= Number(r.mood_pct ?? 0) ? "🍜" : "✨"} {r.name}{" "}
              <span style={{ color: "var(--sub)", fontSize: 12 }}>
                · {r.region}
                {r.theme ? ` · ${r.theme}` : ""}
                {r.revisit_pct != null ? ` · 재방문 ${r.revisit_pct}%` : " · 네이버 미검증"}
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

// 음식/분위기 유형에 따라 한 줄 설명 생성 (항상 최소 한 줄 보장)
function makeHighlight(d, texts, taste) {
  const tastePct = d.taste_official ?? taste ?? 0;
  const moodPct = d.mood_official ?? 0;
  const isFood = tastePct >= moodPct;
  const pct = isFood ? tastePct : moodPct;
  const tag = isFood ? "맛" : "분위기";
  const cnt = d.reviews ? Math.round((d.reviews * pct) / 100) : 0;

  const parts = [];
  const menu = isFood ? (d.menus || [])[0] : null;
  if (menu) parts.push(`대표메뉴 ${menu}`);
  parts.push(cnt ? `후기 ${d.reviews}명 중 ${cnt}명이 '${tag}'을 꼽았어요` : `'${tag}' 평가가 좋은 곳`);
  const kws = topHits(texts, isFood ? FOOD_HINTS : MOOD_HINTS);
  if (kws.length) parts.push(`${kws.join("·")} 언급`);
  return parts.join(" · ");
}

// ─────────────────────────────────────────────
// ② 수집 — 카카오 전용, 동 전체를 끝까지 검수
// ─────────────────────────────────────────────
function CrawlSection({ pass, f, onDone }) {
  const [region, setRegion] = useState("");
  const [collectType, setCollectType] = useState("both"); // both | food | mood
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
    if (!region.trim()) return alert("지역을 입력하세요. 예: 서울 성북구 성북동");
    if (!hasSupabase) return alert("Supabase 연결 후 사용 가능합니다.");
    setRunning(true);
    setLogs([]);
    setProg(null);
    const kw = keywords.split(",").map((s) => s.trim()).filter(Boolean);
    let savedCount = 0;

    let existing = new Set();
    if (skipExisting) {
      const { data } = await supabase.from("restaurants").select("name").eq("region", region.trim());
      existing = new Set((data || []).map((x) => x.name));
      if (existing.size) log(`이 동네에 이미 ${existing.size}곳이 있어요 — 새 가게만 검수합니다.`);
    }

    try {
      log(`[카카오] '${region} 맛집' — 검색 결과 끝까지 수집합니다…`);
      const { candidates } = await api({ mode: "kakao_search", query: `${region} 맛집` });
      log(
        `후보 ${candidates.length}곳 발견 · 기준: ★${f.min_kakao_rating} / 리뷰 ${f.min_kakao_reviews} / 맛 ${f.min_taste_pct}% / 분위기 ${f.min_mood_pct}% · 유형: ${
          collectType === "both" ? "음식+분위기" : collectType === "food" ? "음식맛집만" : "분위기맛집만"
        }`
      );
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
          const kind = taste >= mood ? "음식" : "분위기";
          log(
            `(${i}/${candidates.length}) ${c.name} — ★${d.rating} · 리뷰 ${d.reviews} · 맛 ${taste}% · 분위기 ${mood}% ${
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
            highlight: makeHighlight(d, texts, taste) || null,
            naver_rating: null,
            naver_reviews: null,
            revisit_pct: null,
            address: d.address_hint || "",
            hours: d.hours_hint || "",
            lat: c.lat ?? null,
            lng: c.lng ?? null,
            kakao_url: d.kakao_url || "",
            naver_url: "",
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
        await sleep(500);
      }

      log(savedCount ? `✓ 완료 — 새로 ${savedCount}곳 저장. 아래 ③에서 네이버 검증을 진행하세요.` : "새로 저장된 가게가 없어요. ①의 기준을 조정해보세요.");
      onDone && onDone();
    } catch (e) {
      log(`! 중단: ${e.message}`);
    }
    setRunning(false);
    setProg(null);
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
        검색 결과를 끝까지 검수해요 (놓치는 가게 없음). 가게마다 즉시 저장되니 중간에 멈춰도 그때까지는 남아요.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="field-label">지역</div>
          <input
            placeholder="예: 서울 성북구 성북동"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={running}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 13.5 }}
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
        <button
          onClick={run}
          disabled={running}
          style={{ padding: "9px 20px", background: running ? "var(--sub)" : "var(--stamp)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13.5, fontWeight: 600 }}
        >
          {running ? "수집 중…" : "수집 시작"}
        </button>
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
// 링크 열기 → 리뷰 최신순 → 최근 20개 중 "N번째 방문" 개수 세기 → 입력 → 저장
// ─────────────────────────────────────────────
function NaverVerifyPanel({ refresh, minRevisit, onDone }) {
  const [pending, setPending] = useState([]);
  const [counts, setCounts] = useState({});
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    if (!hasSupabase) return;
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id,name,region,naver_url")
        .is("revisit_pct", null)
        .order("crawled_at", { ascending: false })
        .limit(200);
      setPending(data || []);
    })();
  }, [refresh]);

  async function save(r) {
    const raw = counts[r.id];
    if (raw === undefined || raw === "") return alert("재방문 개수를 입력하세요 (0~20)");
    const cnt = Math.max(0, Math.min(20, Number(raw)));
    const pct = cnt * 5; // 20개 기준 → %
    const { error } = await supabase.from("restaurants").update({ revisit_pct: pct }).eq("id", r.id);
    if (error) return alert(`저장 실패: ${error.message}`);
    setPending(pending.filter((x) => x.id !== r.id));
    setSavedMsg(
      `${r.name}: 재방문 ${cnt}개 (${pct}%) 저장 — ${pct >= minRevisit ? "'네이버까지 검증' 배지가 붙어요 ✓" : "기준 미달이라 '카카오 검증'으로 유지돼요"}`
    );
    onDone && onDone();
  }

  const naverLink = (r) =>
    r.naver_url || `https://map.naver.com/p/search/${encodeURIComponent(`${(r.region || "").split(" ").pop()} ${r.name}`)}`;

  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2 className="serif" style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>
        ③ 네이버 검증 <span style={{ fontSize: 12, fontWeight: 400, color: "var(--sub)" }}>— 수기 확인, 대기 {pending.length}곳</span>
      </h2>
      <ol style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.9, margin: "0 0 14px 18px" }}>
        <li>[네이버 리뷰 열기]를 눌러 가게를 찾고, 리뷰 탭 → <b>최신순</b>으로 바꿔요</li>
        <li>최근 리뷰 <b>20개</b>를 보면서 &ldquo;<b>N번째 방문</b>&rdquo; 표시가 붙은 리뷰 개수를 세요</li>
        <li>개수를 입력하고 저장 — 기준({minRevisit}% = 20개 중 {Math.ceil(minRevisit / 5)}개) 이상이면 홈에 &lsquo;네이버까지 검증&rsquo; 배지가 자동으로 붙어요</li>
      </ol>
      {savedMsg && <p style={{ fontSize: 12.5, color: "var(--stamp)", marginBottom: 10 }}>{savedMsg}</p>}
      {pending.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>검증 대기 중인 가게가 없어요 🎉</p>}
      {pending.map((r) => (
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
