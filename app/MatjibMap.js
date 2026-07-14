"use client";

import { useEffect, useRef } from "react";

/**
 * 검수 통과 가게만 지도에 표시합니다.
 * - 지도 타일: OpenStreetMap (무료, 키 불필요)
 * - 마커 클릭 → 팝업 → "카카오맵에서 보기" 버튼으로 카카오맵 이동
 */
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

export default function MatjibMap({ places }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map());

  // Leaflet 로드 + 지도 1회 생성
  useEffect(() => {
    let cancelled = false;

    function ensureLeaflet() {
      return new Promise((resolve) => {
        if (window.L) return resolve(window.L);
        if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = LEAFLET_CSS;
          document.head.appendChild(link);
        }
        const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(window.L));
          return;
        }
        const s = document.createElement("script");
        s.src = LEAFLET_JS;
        s.onload = () => resolve(window.L);
        document.head.appendChild(s);
      });
    }

    ensureLeaflet().then((L) => {
      if (cancelled || !boxRef.current || mapRef.current) return;
      const map = L.map(boxRef.current, { scrollWheelZoom: false }).setView([37.5665, 126.978], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      drawMarkers(L);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 필터 결과가 바뀔 때마다 마커 갱신
  useEffect(() => {
    if (window.L && mapRef.current) drawMarkers(window.L);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  // 카드의 "지도에서 보기" → 해당 마커로 이동 + 팝업 열기
  useEffect(() => {
    function focusPlace(e) {
      const marker = markersRef.current.get(String(e.detail));
      if (marker && mapRef.current) {
        mapRef.current.flyTo(marker.getLatLng(), 16, { duration: 0.6 });
        setTimeout(() => marker.openPopup(), 650);
      }
    }
    window.addEventListener("matjib:focus", focusPlace);
    return () => window.removeEventListener("matjib:focus", focusPlace);
  }, []);

  function drawMarkers(L) {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();

    const pts = places.filter((p) => p.lat && p.lng);
    pts.forEach((p) => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="map-stamp" title="${esc(p.name)}"></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const kakaoHref =
        p.kakao_url || `https://map.kakao.com/link/search/${encodeURIComponent(p.name)}`;
      const hlText =
        String(p.highlight || "")
          .replace(/후기 [\d,]+명 중 [\d,]+명이 '[^']+'[을를] 꼽았어요( · )?/g, "")
          .trim()
          .slice(0, 64) ||
        `★${Number(p.kakao_rating).toFixed(1)} · 리뷰 ${Number(p.kakao_reviews).toLocaleString()}개`;
      const naverHref =
        p.naver_url ||
        `https://map.naver.com/p/search/${encodeURIComponent(`${(p.region || "").split(" ").pop()} ${p.name}`)}`;
      const marker = L.marker([Number(p.lat), Number(p.lng)], { icon }).addTo(layer);
      markersRef.current.set(String(p.id), marker);
      marker.bindPopup(
        `<div style="font-family:Pretendard Variable,sans-serif;min-width:190px;letter-spacing:-0.2px">
           <div style="font-size:11px;color:#8b95a1">${esc(p.category || "")}</div>
           <div style="font-weight:700;font-size:15px;margin:2px 0 4px">${esc(p.name)}</div>
           <div style="font-size:12px;color:#4e5968;line-height:1.5;margin-bottom:8px">
             ${esc(hlText)}
           </div>
           <a href="${kakaoHref}" target="_blank" rel="noreferrer"
              style="display:block;text-align:center;background:#3182f6;color:#fff;
                     padding:10px 0;border-radius:12px;font-size:13px;font-weight:600;text-decoration:none">
             카카오맵에서 보기 ↗
           </a>
           <a href="${naverHref}" target="_blank" rel="noreferrer"
              style="display:block;text-align:center;background:#e7f8ee;color:#059142;
                     padding:9px 0;border-radius:12px;font-size:12.5px;font-weight:600;text-decoration:none;margin-top:6px">
             네이버지도에서 보기 ↗
           </a>
         </div>`,
        { closeButton: true }
      );
    });

    if (pts.length) {
      const bounds = L.latLngBounds(pts.map((p) => [Number(p.lat), Number(p.lng)]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }

  const missing = places.filter((p) => !p.lat || !p.lng).length;

  return (
    <div>
      <div
        ref={boxRef}
        style={{
          height: 420,
          borderRadius: 20,
          border: "none",
          overflow: "hidden",
          background: "#eaf0f4",
          zIndex: 0,
        }}
        aria-label="검수 통과 맛집 지도"
      />
      <p style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 8 }}>
        파란 핀을 누르면 가게 정보와 카카오맵 이동 버튼이 나와요.
        {missing > 0 && ` (좌표 없는 ${missing}곳은 아래 장부에만 표시)`}
      </p>
    </div>
  );
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
