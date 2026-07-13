"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, hasSupabase } from "../../lib/supabase";
import { DEFAULT_FILTERS, SITE_NAME } from "../../lib/constants";

// 간단 잠금용 비밀번호 — Vercel 환경변수 NEXT_PUBLIC_ADMIN_PASS 로 변경하세요
const PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";

export default function Admin() {
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  const [f, setF] = useState(DEFAULT_FILTERS);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!ok || !hasSupabase) return;
    (async () => {
      const [s, r] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("restaurants").select("id,name,region,crawled_at").order("crawled_at", { ascending: false }),
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
  }, [ok]);

  async function saveDefaults() {
    if (!hasSupabase) return setMsg("Supabase 연결 후 사용 가능합니다.");
    const { error } = await supabase.from("settings").upsert({ id: 1, ...f });
    setMsg(error ? `저장 실패: ${error.message}` : "기본값이 저장되었습니다. 방문자 화면에 바로 적용됩니다.");
  }

  async function remove(id) {
    if (!confirm("이 가게를 장부에서 삭제할까요?")) return;
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
    <div className="wrap" style={{ padding: "40px 20px 80px", maxWidth: 720 }}>
      <Link href="/" style={{ fontSize: 12.5, color: "var(--sub)", textDecoration: "none" }}>
        ← 홈으로
      </Link>
      <h1 className="serif" style={{ fontSize: 22, fontWeight: 900, margin: "18px 0 24px" }}>
        관리자
      </h1>

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
          새 데이터는 크롤러(crawler 폴더)를 실행하면 자동으로 추가됩니다.
        </p>
        {!hasSupabase && <p style={{ fontSize: 13, color: "var(--sub)" }}>Supabase 연결 후 표시됩니다.</p>}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}
          >
            <span>
              {r.name} <span style={{ color: "var(--sub)", fontSize: 12 }}>· {r.region}</span>
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
