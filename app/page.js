"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="map skel" />,
});
import { supabase, hasSupabase } from "../lib/supabase";
import { SITE, SAMPLE } from "../lib/config";

export default function Home() {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("전체");
  const [type, setType] = useState("전체"); // 전체 | food | mood
  const [onlyGuaranteed, setOnlyGuaranteed] = useState(false);
  const [sort, setSort] = useState("reco");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      if (!hasSupabase) {
        setPlaces(SAMPLE);
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("places")
          .select(
            "id,kakao_id,region,name,theme,category,is_food,is_mood,kakao_rating,kakao_reviews,taste_count,taste_pct,mood_count,mood_pct,revisit_pct,trust_tier,highlight,top_menu,lat,lng,kakao_url,naver_url"
          )
          .eq("status", "live")
          .order("kakao_rating", { ascending: false });
        if (error) {
          console.warn("places load error:", error.message);
          setPlaces(SAMPLE);
        } else {
          const clean = (data || []).filter((x) => x && x.id && x.name);
          setPlaces(clean.length ? clean : SAMPLE);
        }
      } catch (e) {
        console.warn(e);
        setPlaces(SAMPLE);
      }
      setLoading(false);
    })();
  }, []);

  // 공유 링크 복원 & 주소 반영
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const r = q.get("region");
    const t = q.get("type");
    if (r) setRegion(decodeURIComponent(r));
    if (t === "food" || t === "mood") setType(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams();
    if (region !== "전체") q.set("region", region);
    if (type !== "전체") q.set("type", type);
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [region, type]);

  const regions = useMemo(
    () => ["전체", ...Array.from(new Set(places.map((p) => p.region).filter(Boolean))).sort()],
    [places]
  );

  const scoped = places.filter(
    (p) =>
      (region === "전체" || p.region === region) &&
      (type === "전체" || (type === "food" ? p.is_food : p.is_mood)) &&
      (!onlyGuaranteed || p.trust_tier === "naver")
  );

  const SORTS = {
    reco: (a, b) =>
      (b.trust_tier === "naver") - (a.trust_tier === "naver") ||
      Number(b.kakao_rating ?? 0) - Number(a.kakao_rating ?? 0),
    rating: (a, b) => Number(b.kakao_rating ?? 0) - Number(a.kakao_rating ?? 0),
    revisit: (a, b) => Number(b.revisit_pct ?? -1) - Number(a.revisit_pct ?? -1),
    reviews: (a, b) => Number(b.kakao_reviews ?? 0) - Number(a.kakao_reviews ?? 0),
  };

  const visible = [...scoped].sort(SORTS[sort]);
  const guaranteed = scoped.filter((p) => p.trust_tier === "naver").length;

  async function searchRegion() {
    const q = query.trim();
    if (q.length < 2) return;
    const hit = regions.find((r) => r !== "전체" && r.includes(q));
    if (hit) {
      setRegion(hit);
      setNotice("");
      setQuery("");
      return;
    }
    if (hasSupabase) {
      try {
        const { data } = await supabase.from("regions").select("id,request_count").eq("name", q).maybeSingle();
        if (data) {
          await supabase.from("regions").update({ request_count: (data.request_count || 0) + 1 }).eq("id", data.id);
        } else {
          await supabase.from("regions").insert({ name: q, status: "requested", request_count: 1 });
        }
      } catch {}
    }
    setNotice(`'${q}'은(는) 아직 준비 중이에요. 요청이 접수됐어요 — 곧 추가할게요!`);
    setQuery("");
  }

  function share(text, url) {
    if (navigator.share) navigator.share({ title: SITE.name, text, url }).catch(() => {});
    else {
      navigator.clipboard?.writeText(url);
      setToast("링크를 복사했어요");
      setTimeout(() => setToast(""), 2000);
    }
  }

  return (
    <div>
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--line)" }}>
        <div className="wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 38, height: 38, borderRadius: 12, background: "var(--blue)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16,
              }}
              aria-hidden
            >
              맛
            </span>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 800 }}>{SITE.name}</h1>
              <p style={{ fontSize: 11.5, color: "var(--sub)" }}>{SITE.tagline}</p>
            </div>
          </div>
          <Link href="/admin" style={{ fontSize: 12, color: "var(--sub)" }}>
            관리자
          </Link>
        </div>
      </header>

      <main className="wrap" style={{ padding: "20px 20px 80px" }}>
        {/* 컨트롤 */}
        <div className="card stack-mobile" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ display: "flex", gap: 6, flex: "1 1 240px", minWidth: 0 }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="동네 검색 (예: 연남동)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchRegion()}
              aria-label="동네 검색"
            />
            <button className="btn btn-dark" onClick={searchRegion}>
              찾기
            </button>
          </span>

          <select className="select" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역">
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>

          <div className="chips" role="tablist" aria-label="유형">
            {[
              ["전체", "전체"],
              ["food", "🍜 음식맛집"],
              ["mood", "✨ 분위기맛집"],
            ].map(([v, l]) => (
              <button key={v} className="chip" role="tab" aria-selected={type === v} onClick={() => setType(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {notice && (
          <p style={{ fontSize: 12.5, color: "var(--blue-deep)", background: "var(--blue-soft)", padding: "10px 14px", borderRadius: 12, marginBottom: 16 }}>
            {notice}
          </p>
        )}

        {/* 지도 */}
        <div id="map-anchor" style={{ marginBottom: 8 }}>
          <Map places={scoped} />
        </div>
        <div
          style={{
            display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center",
            fontSize: 11.5, color: "var(--sub)", margin: "8px 2px 20px",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "var(--blue)", display: "inline-block" }} />
            <b style={{ color: "var(--blue-deep)" }}>무조건 맛집 보장</b> — 최근 방문객 20명 중 4명 이상이 재방문
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: "#93b8ee", display: "inline-block" }} />
            <b>맛집일 확률 높음</b> — 평점·리뷰·맛 평가 통과 (재방문 확인 전)
          </span>
        </div>

        {/* 목록 헤더 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>{region} 맛집</h2>
          <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
            {loading ? "불러오는 중…" : `${scoped.length}곳 · 보장 ${guaranteed}곳`}
          </span>
          <button
            onClick={() => share(`${region} 검증 맛집 ${scoped.length}곳`, window.location.href)}
            style={{ marginLeft: "auto", background: "none", border: 0, color: "var(--blue)", fontSize: 12.5, fontWeight: 600 }}
          >
            공유하기 ↗
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="정렬">
            <option value="reco">추천순 (보장 우선)</option>
            <option value="rating">평점순</option>
            <option value="revisit">재방문순</option>
            <option value="reviews">리뷰 많은 순</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={onlyGuaranteed}
              onChange={(e) => setOnlyGuaranteed(e.target.checked)}
              style={{ accentColor: "var(--blue)" }}
            />
            무조건 맛집 보장만 보기
          </label>
        </div>

        {loading && (
          <div style={{ display: "grid", gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card">
                <div className="skel" style={{ width: "40%", height: 20, marginBottom: 12 }} />
                <div className="skel" style={{ width: "90%", height: 14, marginBottom: 8 }} />
                <div className="skel" style={{ width: "60%", height: 14 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "44px 20px" }}>
            <p style={{ fontSize: 14, color: "var(--sub)", marginBottom: 12 }}>이 조건에 맞는 맛집이 아직 없어요.</p>
            <p style={{ fontSize: 12.5, color: "var(--sub)" }}>위에서 다른 동네를 검색하거나 유형을 바꿔보세요.</p>
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {visible.map((p) => (
            <Card key={p.id} p={p} onShare={share} />
          ))}
        </div>
      </main>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "var(--ink)", color: "#fff", padding: "10px 18px", borderRadius: 999, fontSize: 13, zIndex: 999,
          }}
        >
          {toast}
        </div>
      )}

      <footer style={{ borderTop: "1px solid var(--line)", padding: "24px 0", textAlign: "center" }}>
        <p style={{ fontSize: 11.5, color: "var(--sub)" }}>
          데이터 출처: 카카오맵 · 네이버 (수집 시점 기준이며 실제와 다를 수 있어요)
        </p>
      </footer>
    </div>
  );
}

function Card({ p, onShare }) {
  const guaranteed = p.trust_tier === "naver";
  const isFoodMain = Number(p.taste_pct ?? 0) >= Number(p.mood_pct ?? 0);
  const tagPct = isFoodMain ? p.taste_pct : p.mood_pct;
  const tagCount = isFoodMain ? p.taste_count : p.mood_count;
  const tagLabel = isFoodMain ? "맛" : "분위기";

  const kakao = p.kakao_url || `https://map.kakao.com/link/search/${encodeURIComponent(p.name)}`;
  const naver =
    p.naver_url ||
    `https://map.naver.com/p/search/${encodeURIComponent(`${(p.region || "").split(" ").pop()} ${p.name}`)}`;

  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: "var(--sub)" }}>{p.region}</span>
          {p.is_food && <span className="badge badge-sm badge-food">🍜 음식맛집</span>}
          {p.is_mood && <span className="badge badge-sm badge-mood">✨ 분위기맛집</span>}
        </div>
        <span
          className={`badge badge-sm ${guaranteed ? "badge-naver" : "badge-kakao"}`}
          title={
            guaranteed
              ? "카카오 평점·리뷰·맛 평가 통과 + 네이버 최근 리뷰 20개 중 4개 이상이 재방문"
              : "카카오 평점·리뷰·맛 평가 통과 (네이버 재방문은 아직 확인 전)"
          }
        >
          {guaranteed ? "무조건 맛집 보장" : "맛집일 확률 높음"}
        </span>
      </div>

      <h3
        style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35, cursor: p.lat ? "pointer" : "default" }}
        onClick={() => {
          if (!p.lat || !p.lng) return;
          window.dispatchEvent(new CustomEvent("matjib:focus", { detail: p.id }));
          document.getElementById("map-anchor")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        title={p.lat ? "지도에서 위치 보기" : undefined}
      >
        {p.name}
        {p.category && (
          <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--sub)", marginLeft: 8 }}>{p.category}</span>
        )}
      </h3>

      {p.highlight && (
        <p style={{ fontSize: 13.5, color: "var(--body)", marginTop: 6, lineHeight: 1.6 }}>{p.highlight}</p>
      )}

      <div className="metrics">
        <div>
          <b style={{ color: "var(--blue-deep)" }}>★ {p.kakao_rating ?? "—"}</b>
          <span>카카오 평점</span>
        </div>
        <div>
          <b>{p.kakao_reviews != null ? Number(p.kakao_reviews).toLocaleString() : "—"}</b>
          <span>카카오 리뷰</span>
        </div>
        <div>
          <b style={{ color: p.revisit_pct != null ? "var(--blue)" : "var(--sub)" }}>
            {p.revisit_pct != null ? `${p.revisit_pct}%` : "미검증"}
          </b>
          <span>재방문</span>
        </div>
        <div>
          <b>{tagCount != null ? `${tagCount}명` : "—"}</b>
          <span>
            {tagLabel} 꼽음{tagPct != null ? ` (${tagPct}%)` : ""}
          </span>
        </div>
      </div>

      <div className="card-actions" style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <a className="btn btn-primary" href={kakao} target="_blank" rel="noreferrer">
          카카오맵에서 보기
        </a>
        <a className="btn btn-green" href={naver} target="_blank" rel="noreferrer">
          네이버지도에서 보기
        </a>
        <button
          className="btn btn-ghost"
          onClick={() =>
            onShare(`${p.name} — ${p.highlight || "검증된 맛집"}`, `${window.location.origin}?region=${encodeURIComponent(p.region)}`)
          }
        >
          공유
        </button>
      </div>
    </article>
  );
}
