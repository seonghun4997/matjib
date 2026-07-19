"use client";
import { useEffect, useRef, useState } from "react";

// 디깅코퍼레이션 사업체 스위처 — 어드민 상단 우측 [🏢 사업체] 버튼 → 목록 → 새 탭 이동.
// 8개 저장소 공용 파일. 저장소마다 다른 것은 아래 SELF_KEY 한 줄뿐이다.
// 주소가 바뀌면 COMPANIES의 url만 고치면 된다.
const SELF_KEY = "matjib";

const COMPANIES = [
  { key: "adscout",    name: "광고정찰소",   emoji: "🛰",  url: "https://adscout-bice.vercel.app" },
  { key: "commerlab2", name: "커머랩",       emoji: "📚", url: "https://commerlab2.vercel.app" },
  { key: "dibs",       name: "DIBS",         emoji: "🏢", url: "https://dibs-liart.vercel.app" },
  { key: "jarimood",   name: "컨셉부동산",   emoji: "🍯", url: "https://conceptbd.vercel.app" },
  { key: "matjib",     name: "맛집검수소",   emoji: "🍜", url: "https://matjib-jari3.vercel.app" },
  { key: "myungrilab", name: "홍서당",       emoji: "🧧", url: "https://myungrilab.vercel.app" },
  { key: "nihon",      name: "NIHON",        emoji: "🗾", url: "https://nihon-kappa.vercel.app" },
  { key: "sunghoon",   name: "전성훈 프로필", emoji: "👤", url: "https://sunghoon-nine.vercel.app" },
];

export default function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    const t = setTimeout(() => document.addEventListener("mousedown", away), 0);
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} title="다른 사업체 보기"
        style={{
          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
          fontSize: 13, fontWeight: 600, color: "#333d4b",
          background: open ? "#f2f4f6" : "#fff", border: "1px solid #e5e8eb",
          borderRadius: 999, padding: "7px 13px", lineHeight: 1,
        }}
      >
        <span>🏢</span><span>사업체</span>
      </button>

      {open && (
        <div
          role="dialog" aria-label="다른 사업체 보기"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 9999, width: 240,
            background: "#fff", border: "1px solid #e5e8eb", borderRadius: 16,
            boxShadow: "0 12px 32px rgba(16,24,40,.14)", padding: 6, textAlign: "left",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#8b95a1", letterSpacing: ".05em", padding: "8px 10px 6px" }}>
            디깅코퍼레이션 사업체
          </div>
          {COMPANIES.map((c) => c.key === SELF_KEY ? (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 10, background: "#f2f4f6" }}>
              <span style={{ fontSize: 16 }}>{c.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#191f28" }}>{c.name}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#8b95a1" }}>여기</span>
            </div>
          ) : (
            <a
              key={c.key} href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 10, color: "#191f28", textDecoration: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f2f4f6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 16 }}>{c.emoji}</span>
              <span style={{ fontSize: 13 }}>{c.name}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#8b95a1" }}>↗</span>
            </a>
          ))}
          <div style={{ fontSize: 11, color: "#8b95a1", padding: "8px 10px 4px", borderTop: "1px solid #f2f4f6", marginTop: 4, lineHeight: 1.5 }}>
            새 탭으로 열립니다.<br />사업체마다 로그인은 따로입니다.
          </div>
        </div>
      )}
    </div>
  );
}
