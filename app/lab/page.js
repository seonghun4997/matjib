"use client";

import { useState } from "react";
import Link from "next/link";

const PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib";

// 서로 다른 성격의 가게를 섞어야 구조를 정확히 파악할 수 있어요
const PRESETS = [
  "성북동 쌍다리돼지불백",
  "성북동 수연산방",
  "연남동 연남토마",
  "성수동 대림창고",
];

export default function Lab() {
  const [pw, setPw] = useState("");
  const [ok, setOk] = useState(false);
  const [queries, setQueries] = useState(PRESETS.join("\n"));
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    setRunning(true);
    setOut("");
    setCopied(false);
    const list = queries.split("\n").map((s) => s.trim()).filter(Boolean);
    const results = [];

    for (const q of list) {
      try {
        const r = await fetch("/api/lab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pass: pw, query: q }),
        });
        const j = await r.json();
        results.push({ query: q, ...j });
        setOut(JSON.stringify(results, null, 2));
      } catch (e) {
        results.push({ query: q, error: String(e?.message || e) });
        setOut(JSON.stringify(results, null, 2));
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    setRunning(false);
  }

  function copy() {
    navigator.clipboard?.writeText(out);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!ok) {
    return (
      <div style={{ maxWidth: 340, margin: "120px auto", padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>진단 도구</h1>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pw === PASS && setOk(true)}
          placeholder="관리자 비밀번호"
          style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 14 }}
        />
        <button
          onClick={() => pw === PASS && setOk(true)}
          style={{ width: "100%", marginTop: 10, padding: "10px 0", background: "var(--ink)", color: "#fff", border: 0, borderRadius: 12, fontSize: 14 }}
        >
          들어가기
        </button>
        <Link href="/" style={{ display: "block", marginTop: 18, fontSize: 12, color: "var(--sub)" }}>
          ← 홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ padding: "40px 20px 80px", maxWidth: 900 }}>
      <Link href="/admin" style={{ fontSize: 12.5, color: "var(--sub)", textDecoration: "none" }}>
        ← 관리자
      </Link>
      <h1 className="serif" style={{ fontSize: 22, fontWeight: 900, margin: "18px 0 8px" }}>
        진단 도구
      </h1>
      <p style={{ fontSize: 13, color: "var(--sub)", marginBottom: 20, lineHeight: 1.7 }}>
        카카오가 실제로 주는 데이터 구조를 확인합니다. 아래 가게들을 조회한 뒤 결과를 복사해서 공유해주세요.
        <br />
        의심도(조작 감지) 로직을 추측 없이 정확하게 만들기 위한 단계입니다.
      </p>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="field-label">조회할 가게 (한 줄에 하나)</div>
        <textarea
          value={queries}
          onChange={(e) => setQueries(e.target.value)}
          rows={5}
          disabled={running}
          style={{ width: "100%", padding: 12, border: "1px solid var(--line)", borderRadius: 12, fontSize: 13, fontFamily: "inherit", marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={run}
            disabled={running}
            style={{ padding: "10px 20px", background: running ? "var(--sub)" : "var(--stamp)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13.5, fontWeight: 600 }}
          >
            {running ? "조회 중…" : "진단 실행"}
          </button>
          {out && (
            <button
              onClick={copy}
              style={{ padding: "10px 16px", background: "var(--ink)", color: "#fff", border: 0, borderRadius: 12, fontSize: 13 }}
            >
              {copied ? "복사됨 ✓" : "결과 전체 복사"}
            </button>
          )}
        </div>
      </section>

      {out && (
        <pre
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 16,
            fontSize: 11.5,
            lineHeight: 1.6,
            overflowX: "auto",
            maxHeight: 600,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {out}
        </pre>
      )}
    </div>
  );
}
