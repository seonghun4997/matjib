"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../../lib/supabase";
import { DEFAULTS, SITE } from "../../lib/config";

const PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";

export default function Admin() {
  const [pw, setPw] = useState("");
  const [ok, setOk] = useState(false);
  const [tab, setTab] = useState("dash");
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [nudge, setNudge] = useState(0); // 데이터 갱신 트리거

  const refresh = useCallback(() => setNudge((n) => n + 1), []);

  useEffect(() => {
    if (!ok || !hasSupabase) return;
    (async () => {
      const [st, live, hidden, pending, reqs] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("places").select("id", { count: "exact", head: true }).eq("status", "live"),
        supabase.from("places").select("id", { count: "exact", head: true }).eq("status", "hidden"),
        supabase.from("places").select("id", { count: "exact", head: true }).is("revisit_pct", null).eq("status", "live"),
        supabase.from("regions").select("id", { count: "exact", head: true }).eq("status", "requested"),
      ]);
      if (st.data) setSettings({ ...DEFAULTS, ...st.data });
      setStats({
        live: live.count ?? 0,
        hidden: hidden.count ?? 0,
        pending: pending.count ?? 0,
        requests: reqs.count ?? 0,
      });
    })();
  }, [ok, nudge]);

  if (!ok) {
    return (
      <div style={{ maxWidth: 340, margin: "120px auto", padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>{SITE.name} 관리자</h1>
        <input
          type="password"
          className="input"
          style={{ width: "100%" }}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pw === PASS && setOk(true)}
          placeholder="비밀번호"
        />
        <button
          className="btn btn-dark"
          style={{ width: "100%", marginTop: 10 }}
          onClick={() => pw === PASS && setOk(true)}
        >
          들어가기
        </button>
        <Link href="/" style={{ display: "block", marginTop: 18, fontSize: 12, color: "var(--sub)" }}>
          ← 홈으로
        </Link>
      </div>
    );
  }

  const TABS = [
    ["dash", "대시보드"],
    ["collect", "수집"],
    ["verify", `네이버 검증${stats?.pending ? ` ${stats.pending}` : ""}`],
    ["manage", "가게 관리"],
    ["settings", "설정"],
  ];

  return (
    <div className="wrap-sm" style={{ padding: "32px 20px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 21, fontWeight: 800 }}>{SITE.name} 관리자</h1>
        <Link href="/" style={{ fontSize: 12.5, color: "var(--sub)" }}>
          고객 화면 보기 ↗
        </Link>
      </div>

      <div
        className="chips"
        role="tablist"
        style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--bg)", padding: "8px 0 14px" }}
      >
        {TABS.map(([v, label]) => (
          <button key={v} className="chip" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}>
            {label}
          </button>
        ))}
      </div>

      {!hasSupabase && (
        <p className="card" style={{ color: "var(--danger)", fontSize: 13 }}>
          Supabase 환경변수가 없어요. Vercel에 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 를 넣고 Redeploy 하세요.
        </p>
      )}

      {tab === "dash" && <Dashboard stats={stats} pass={pw} onDone={refresh} />}
      {tab === "collect" && <Collect pass={pw} settings={settings} onDone={refresh} />}
      {tab === "verify" && <Verify settings={settings} nudge={nudge} onDone={refresh} />}
      {tab === "manage" && <Manage settings={settings} nudge={nudge} onDone={refresh} />}
      {tab === "settings" && <Settings settings={settings} setSettings={setSettings} onDone={refresh} />}
    </div>
  );
}

/* ══════════════ 대시보드 ══════════════ */
function Dashboard({ stats, pass, onDone }) {
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!hasSupabase) return;
    supabase
      .from("runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRuns(data || []));
  }, [result]);

  async function runAuto() {
    setRunning(true);
    setResult("자동 갱신 실행 중… (1~5분, 이 탭을 열어두세요)");
    try {
      const r = await fetch(`/api/cron?key=${encodeURIComponent(pass)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      const lines = (j.regions || []).map((x) => `· ${x.region} — 검수 ${x.checked} · 저장 ${x.saved} · 숨김 ${x.hidden}`);
      setResult(`✓ 완료 — 저장 ${j.saved}곳 · 자동숨김 ${j.hidden}곳\n${lines.join("\n") || "처리할 동네가 없었어요."}`);
      onDone();
    } catch (e) {
      setResult(`실패: ${e.message}`);
    }
    setRunning(false);
  }

  const Card = ({ label, value, color, hint }) => (
    <div className="card" style={{ flex: "1 1 140px" }}>
      <div style={{ fontSize: 11.5, color: "var(--sub)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || "var(--ink)", marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>{hint}</div>}
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Card label="공개 중" value={stats?.live ?? "…"} color="var(--blue)" />
        <Card label="검증 대기" value={stats?.pending ?? "…"} color="var(--warn)" hint="네이버 검증 필요" />
        <Card label="자동 숨김" value={stats?.hidden ?? "…"} color="var(--danger)" hint="조작 의심" />
        <Card label="요청 동네" value={stats?.requests ?? "…"} hint="고객이 요청" />
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>🤖 자동 갱신</h2>
        <p style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.8, marginBottom: 12 }}>
          매일 새벽 3시에 자동 실행돼요 — 고객이 요청한 동네를 수집하고, 오래된 동네는 최신 데이터로 갱신하고,
          조작 의심 가게는 자동으로 숨깁니다.
        </p>
        <button className="btn btn-dark" onClick={runAuto} disabled={running}>
          {running ? "실행 중…" : "지금 실행"}
        </button>
        {result && (
          <pre className="log" style={{ marginTop: 10, fontFamily: "inherit" }}>
            {result}
          </pre>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>최근 실행 이력</h2>
        {runs.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>아직 실행 기록이 없어요.</p>}
        {runs.map((r) => (
          <div key={r.id} className="row">
            <span style={{ flex: 1, minWidth: 140 }}>
              {new Date(r.started_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              <span style={{ color: "var(--sub)", fontSize: 12, marginLeft: 6 }}>
                {r.kind === "auto" ? "자동" : "수동"}
              </span>
            </span>
            <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
              {(r.regions || []).join(", ") || "—"} · 저장 {r.saved} · 숨김 {r.hidden}
              {r.errors > 0 && ` · 오류 ${r.errors}`}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}

/* ══════════════ 수집 ══════════════ */
function Collect({ pass, settings, onDone }) {
  const [input, setInput] = useState("");
  const [requests, setRequests] = useState([]);
  const [skip, setSkip] = useState(true);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState(null);
  const [logs, setLogs] = useState([]);
  const stop = useRef(false);
  const logRef = useRef(null);

  const log = (t) => setLogs((l) => [...l, t]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (!hasSupabase) return;
    supabase
      .from("regions")
      .select("id,name,request_count")
      .eq("status", "requested")
      .order("request_count", { ascending: false })
      .then(({ data }) => setRequests(data || []));
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function api(payload) {
    const r = await fetch("/api/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass, ...payload }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `요청 실패 (${r.status})`);
    return j;
  }

  async function run() {
    const regions = input.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (!regions.length) return alert("동네를 입력하세요. 예: 서울 성북구 성북동");
    stop.current = false;
    setRunning(true);
    setLogs([]);
    let total = 0;

    for (let qi = 0; qi < regions.length; qi++) {
      if (stop.current) break;
      const region = regions[qi];
      if (regions.length > 1) log(`\n═══ [${qi + 1}/${regions.length}] ${region} ═══`);
      total += await runOne(region);
      onDone();
    }

    log(stop.current ? `■ 중단됨 — 저장된 ${total}곳은 모두 반영됐어요.` : `\n✓ 전체 완료 — 총 ${total}곳 저장`);
    setRunning(false);
    setProg(null);
  }

  async function runOne(region) {
    let saved = 0;
    let fails = 0;

    try {
      // 동네 등록/갱신
      await supabase.from("regions").upsert({ name: region, status: "collecting" }, { onConflict: "name" });

      let existing = new Set();
      if (skip) {
        const { data } = await supabase.from("places").select("kakao_id").eq("region", region);
        existing = new Set((data || []).map((x) => x.kakao_id));
        if (existing.size) log(`이미 ${existing.size}곳 수집됨 — 새 가게만 검수`);
      }

      log(`카카오맵에서 '${region} 맛집' 전체 검색 중…`);
      const { candidates } = await api({ mode: "search", region });
      candidates.sort((a, b) => b.review_hint - a.review_hint);
      log(`후보 ${candidates.length}곳 · 기준: ★${settings.min_rating} / 리뷰 ${settings.min_reviews} / 맛 ${settings.min_taste_pct}% / 분위기 ${settings.min_mood_pct}%`);

      for (let i = 0; i < candidates.length; i++) {
        if (stop.current) {
          log(`■ 중단 — ${region}에서 ${saved}곳 저장`);
          break;
        }
        const c = candidates[i];
        setProg({ i: i + 1, total: candidates.length, saved });
        if (skip && existing.has(c.kakao_id)) continue;
        if (fails >= 5) {
          log("연속 실패가 많아 중단합니다. /lab 진단을 실행해주세요.");
          break;
        }

        try {
          const r = await api({ mode: "place", kakaoId: c.kakao_id, region, candidate: c });
          fails = 0;
          if (r.saved) {
            saved++;
            const kinds = [r.isFood && "🍜", r.isMood && "✨"].filter(Boolean).join("");
            const sus = r.suspect_score > 0 ? ` ⚠️${r.suspect_score}${r.hidden ? "(숨김)" : ""}` : "";
            log(`${kinds} ${c.name} — ★${r.rating} · 리뷰 ${r.reviews} · 맛 ${r.taste_pct ?? "-"}% · 분위기 ${r.mood_pct ?? "-"}%${sus}`);
          } else {
            log(`   ${c.name} — ★${r.rating ?? "-"} · 맛 ${r.taste_pct ?? "-"}% → 제외`);
          }
          setProg({ i: i + 1, total: candidates.length, saved });
        } catch (e) {
          fails++;
          log(`   ! ${c.name} 실패: ${e.message}`);
        }
        await sleep(450);
      }

      const { count } = await supabase
        .from("places")
        .select("id", { count: "exact", head: true })
        .eq("region", region)
        .eq("status", "live");
      await supabase
        .from("regions")
        .update({ status: "ready", last_collected_at: new Date().toISOString(), place_count: count || 0 })
        .eq("name", region);

      log(`✓ ${region} — 새로 ${saved}곳 저장 (공개 ${count || 0}곳)`);
    } catch (e) {
      log(`! ${region} 오류: ${e.message}`);
    }
    return saved;
  }

  return (
    <section className="card">
      <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>동네 수집</h2>
      <p style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.7, marginBottom: 14 }}>
        검색 결과를 끝까지 검수해요. 가게마다 즉시 저장되니 [중단]하거나 창을 닫아도 그때까지는 반영됩니다.
      </p>

      {requests.length > 0 && (
        <div style={{ background: "var(--blue-soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: 12.5, color: "var(--blue-deep)" }}>🙋 고객이 요청한 동네 {requests.length}곳</b>
            <button className="btn btn-primary btn-sm" disabled={running} onClick={() => setInput(requests.map((r) => r.name).join("\n"))}>
              전부 넣기
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--body)", marginTop: 6 }}>
            {requests.map((r) => `${r.name}${r.request_count > 1 ? ` (${r.request_count})` : ""}`).join(" · ")}
          </p>
        </div>
      )}

      <label className="label">동네 (여러 줄 = 자동 순차 수집)</label>
      <textarea
        className="textarea"
        style={{ width: "100%", marginBottom: 10 }}
        rows={3}
        placeholder={"서울 성북구 성북동\n서울 마포구 연남동"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={running}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        {running ? (
          <button className="btn btn-danger" onClick={() => { stop.current = true; log("■ 중단 요청…"); }}>
            중단
          </button>
        ) : (
          <button className="btn btn-primary" onClick={run}>
            수집 시작
          </button>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} disabled={running} style={{ accentColor: "var(--blue)" }} />
          이미 수집된 가게 건너뛰기
        </label>
        <Link href="/lab" style={{ fontSize: 12, color: "var(--sub)", marginLeft: "auto" }}>
          진단 도구 ↗
        </Link>
      </div>

      {prog && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--sub)", marginBottom: 4 }}>
            <span>검수 {prog.i}/{prog.total}</span>
            <b style={{ color: "var(--blue)" }}>저장 {prog.saved}곳</b>
          </div>
          <div className="bar">
            <div style={{ width: `${Math.round((prog.i / prog.total) * 100)}%` }} />
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="log" ref={logRef}>
          {logs.join("\n")}
        </div>
      )}
    </section>
  );
}

/* ══════════════ 네이버 수기 검증 ══════════════ */
function Verify({ settings, nudge, onDone }) {
  const [list, setList] = useState([]);
  const [counts, setCounts] = useState({});
  const [who, setWho] = useState("");
  const [region, setRegion] = useState("전체");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!hasSupabase) return;
    supabase
      .from("places")
      .select("id,name,region,naver_url,kakao_url")
      .is("revisit_pct", null)
      .eq("status", "live")
      .order("kakao_reviews", { ascending: false })
      .limit(300)
      .then(({ data }) => setList(data || []));
  }, [nudge]);

  const need = Math.ceil(Number(settings.min_revisit_pct) / 5);

  async function save(p) {
    const raw = counts[p.id];
    if (raw === undefined || raw === "") return alert("재방문 개수를 입력하세요 (0~20)");
    const c = Math.max(0, Math.min(20, Number(raw)));
    const pct = c * 5;
    const tier = pct >= Number(settings.min_revisit_pct) ? "naver" : "kakao";

    const { error } = await supabase
      .from("places")
      .update({
        revisit_count: c,
        revisit_pct: pct,
        trust_tier: tier,
        verified_at: new Date().toISOString(),
        verified_by: who || null,
      })
      .eq("id", p.id);
    if (error) return alert(`저장 실패: ${error.message}`);

    setList(list.filter((x) => x.id !== p.id));
    setMsg(
      tier === "naver"
        ? `✓ ${p.name} — 재방문 ${c}/20 (${pct}%) → '무조건 맛집 보장' 배지가 붙었어요!`
        : `${p.name} — 재방문 ${c}/20 (${pct}%) → 기준 미달, '맛집일 확률 높음'으로 유지돼요`
    );
    onDone();
  }

  const naverLink = (p) =>
    p.naver_url ||
    `https://map.naver.com/p/search/${encodeURIComponent(`${(p.region || "").split(" ").pop()} ${p.name}`)}`;

  const regions = ["전체", ...Array.from(new Set(list.map((x) => x.region)))];
  const shown = list.filter((x) => region === "전체" || x.region === region);

  return (
    <section className="card">
      <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>네이버 검증 — 대기 {list.length}곳</h2>

      <div style={{ background: "var(--blue-soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <b style={{ fontSize: 12.5, color: "var(--blue-deep)" }}>작업 방법</b>
        <ol style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.9, margin: "6px 0 0 18px" }}>
          <li>[네이버 열기]를 눌러 가게 페이지로 이동</li>
          <li>리뷰 탭 → <b>최신순</b> 정렬</li>
          <li>최근 리뷰 <b>20개</b>에서 &ldquo;<b>N번째 방문</b>&rdquo; 표시가 있는 리뷰 개수를 세기</li>
          <li>개수 입력 → 저장. <b>{need}개 이상</b>이면 &lsquo;무조건 맛집 보장&rsquo; 배지가 붙어요</li>
        </ol>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input className="input" placeholder="검증자 이름 (선택)" value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 150 }} />
        {regions.length > 1 && (
          <select className="select" value={region} onChange={(e) => setRegion(e.target.value)}>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
      </div>

      {msg && (
        <p style={{ fontSize: 12.5, color: "var(--blue-deep)", background: "var(--blue-soft)", padding: "8px 12px", borderRadius: 10, marginBottom: 10 }}>
          {msg}
        </p>
      )}

      {list.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>검증 대기 중인 가게가 없어요 🎉</p>}

      {shown.map((p) => (
        <div key={p.id} className="row">
          <span style={{ flex: 1, minWidth: 140 }}>
            {p.name}
            <span style={{ color: "var(--sub)", fontSize: 12 }}> · {p.region}</span>
          </span>
          <a className="btn btn-green btn-sm" href={naverLink(p)} target="_blank" rel="noreferrer">
            네이버 열기 ↗
          </a>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
            <input
              type="number"
              min={0}
              max={20}
              className="input"
              style={{ width: 58, padding: "6px 8px", textAlign: "center" }}
              value={counts[p.id] ?? ""}
              onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })}
              aria-label={`${p.name} 재방문 개수`}
            />
            /20
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => save(p)}>
            저장
          </button>
        </div>
      ))}
    </section>
  );
}

/* ══════════════ 가게 관리 ══════════════ */
function Manage({ settings, nudge, onDone }) {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("all"); // all | hidden | suspect
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!hasSupabase) return;
    supabase
      .from("places")
      .select("id,name,region,theme,is_food,is_mood,kakao_rating,taste_pct,mood_pct,revisit_pct,suspect_score,suspect_reasons,status,updated_at")
      .order("suspect_score", { ascending: false })
      .limit(500)
      .then(({ data }) => setList(data || []));
  }, [nudge]);

  async function setStatus(p, status) {
    await supabase.from("places").update({ status }).eq("id", p.id);
    setList(list.map((x) => (x.id === p.id ? { ...x, status } : x)));
    onDone();
  }

  async function remove(p) {
    if (!confirm(`${p.name}을(를) 완전히 삭제할까요?`)) return;
    await supabase.from("places").delete().eq("id", p.id);
    setList(list.filter((x) => x.id !== p.id));
    onDone();
  }

  const shown = list
    .filter((p) => (filter === "hidden" ? p.status !== "live" : filter === "suspect" ? p.suspect_score > 0 : true))
    .filter((p) => !q.trim() || p.name.includes(q.trim()) || (p.region || "").includes(q.trim()));

  return (
    <section className="card">
      <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>가게 관리 ({list.length})</h2>
      <p style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.7, marginBottom: 12 }}>
        의심도 {settings.suspect_hide_score}점 이상은 자동으로 숨겨져요. 배지에 마우스를 올리면 근거가 보이고,
        오판이면 [공개]로 되살릴 수 있어요.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["all", "전체"],
          ["suspect", "의심 있음"],
          ["hidden", "숨김/차단"],
        ].map(([v, l]) => (
          <button key={v} className="chip" aria-selected={filter === v} onClick={() => setFilter(v)}>
            {l}
          </button>
        ))}
        <input className="input" placeholder="가게·동네 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
      </div>

      {shown.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>해당하는 가게가 없어요.</p>}

      {shown.map((p) => (
        <div key={p.id} className="row" style={{ opacity: p.status === "live" ? 1 : 0.5 }}>
          <span style={{ flex: 1, minWidth: 150 }}>
            {p.is_food && "🍜"}
            {p.is_mood && "✨"} {p.name}
            <span style={{ color: "var(--sub)", fontSize: 12 }}>
              {" · "}
              {p.region} · ★{p.kakao_rating} · 맛 {p.taste_pct ?? "-"}% · 분위기 {p.mood_pct ?? "-"}%
              {p.revisit_pct != null ? ` · 재방문 ${p.revisit_pct}%` : " · 미검증"}
            </span>
          </span>

          {p.suspect_score > 0 && (
            <span
              className={`badge badge-sm ${p.suspect_score >= settings.suspect_hide_score ? "badge-danger" : "badge-warn"}`}
              title={(p.suspect_reasons || []).join("\n") || ""}
              style={{ cursor: "help" }}
            >
              ⚠️ {p.suspect_score}점
            </span>
          )}
          {p.status !== "live" && (
            <span className="badge badge-sm badge-warn">{p.status === "blocked" ? "차단" : "숨김"}</span>
          )}

          <button className="btn btn-ghost btn-sm" onClick={() => setStatus(p, p.status === "live" ? "blocked" : "live")}>
            {p.status === "live" ? "숨기기" : "공개"}
          </button>
          <button className="btn btn-sm" style={{ background: "none", color: "var(--danger)" }} onClick={() => remove(p)}>
            삭제
          </button>
        </div>
      ))}
    </section>
  );
}

/* ══════════════ 설정 ══════════════ */
function Settings({ settings, setSettings, onDone }) {
  const [msg, setMsg] = useState("");

  async function save() {
    const { error } = await supabase
      .from("settings")
      .upsert({ ...settings, id: 1, updated_at: new Date().toISOString() });
    setMsg(error ? `저장 실패: ${error.message}` : "저장 완료 — 수집과 고객 화면에 동일하게 적용됩니다.");
    onDone();
  }

  const Row = ({ k, label, hint, step = 1 }) => (
    <div style={{ marginBottom: 14 }}>
      <label className="label">{label}</label>
      <input
        type="number"
        step={step}
        className="input"
        style={{ width: 110 }}
        value={settings[k] ?? ""}
        onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })}
      />
      <span style={{ fontSize: 12, color: "var(--sub)", marginLeft: 8 }}>{hint}</span>
    </div>
  );

  return (
    <>
      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>검수 기준</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 14 }}>
          수집할 때도, 고객 화면에 보여줄 때도 이 기준 하나만 사용해요.
        </p>
        <Row k="min_rating" label="카카오 평점" hint="점 이상" step={0.1} />
        <Row k="min_reviews" label="카카오 리뷰 수" hint="개 이상" step={5} />
        <Row k="min_taste_pct" label="맛 태그 비율" hint="% 이상 — 🍜 음식맛집 기준 (태그 참여자 대비)" step={5} />
        <Row k="min_mood_pct" label="분위기 태그 비율" hint="% 이상 — ✨ 분위기맛집 기준" step={5} />
        <Row k="min_revisit_pct" label="재방문 비율" hint="% 이상 — 20개 중 4개 = 20%. '무조건 맛집 보장' 기준" step={5} />
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>조작 감지</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.7, marginBottom: 14 }}>
          만점 계정 편중 · 신규 계정 5점 리뷰 · 특정 시기 집중 등록 · 별점 획일화 · 태그 극단 편중을 종합해
          0~100점으로 계산해요.
        </p>
        <Row k="suspect_hide_score" label="자동 숨김 기준" hint="점 이상이면 고객 화면에서 자동 제외" step={5} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={settings.suspect_enabled !== false}
            onChange={(e) => setSettings({ ...settings, suspect_enabled: e.target.checked })}
            style={{ accentColor: "var(--blue)" }}
          />
          조작 감지 사용
        </label>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>자동 갱신</h2>
        <Row k="auto_refresh_days" label="재수집 주기" hint="일마다 동네를 다시 수집" />
        <Row k="auto_budget" label="1회 처리량" hint="곳 (자동 실행 1회당 검수할 가게 수)" step={10} />
      </section>

      <button className="btn btn-primary" onClick={save}>
        전체 저장
      </button>
      {msg && <p style={{ fontSize: 12.5, color: "var(--blue-deep)", marginTop: 10 }}>{msg}</p>}
    </>
  );
}
