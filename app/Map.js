"use client";

import { useEffect, useRef } from "react";

const CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default function Map({ places = [] }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const pins = useRef(new Map());

  useEffect(() => {
    let dead = false;

    function load() {
      return new Promise((res) => {
        if (window.L) return res(window.L);
        if (!document.querySelector(`link[href="${CSS}"]`)) {
          const l = document.createElement("link");
          l.rel = "stylesheet";
          l.href = CSS;
          document.head.appendChild(l);
        }
        const prev = document.querySelector(`script[src="${JS}"]`);
        if (prev) return prev.addEventListener("load", () => res(window.L));
        const s = document.createElement("script");
        s.src = JS;
        s.onload = () => res(window.L);
        document.head.appendChild(s);
      });
    }

    load()
      .then((L) => {
        if (dead || !box.current || map.current || !L || !L.map) return;
        map.current = L.map(box.current, { scrollWheelZoom: false }).setView([37.5665, 126.978], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        draw(L);
      })
      .catch((e) => console.warn("map load failed:", e));

    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.L && map.current && layer.current) {
      try {
        draw(window.L);
      } catch (e) {
        console.warn("map draw skipped:", e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  useEffect(() => {
    const focus = (e) => {
      const m = pins.current.get(String(e.detail));
      if (m && map.current) {
        map.current.flyTo(m.getLatLng(), 16, { duration: 0.6 });
        setTimeout(() => m.openPopup(), 650);
      }
    };
    window.addEventListener("matjib:focus", focus);
    return () => window.removeEventListener("matjib:focus", focus);
  }, []);

  function draw(L) {
    if (!L || !L.marker || !L.divIcon || !layer.current || !map.current) return;
    try {
      layer.current.clearLayers();
    } catch {
      return;
    }
    pins.current.clear();

    const valid = (places || []).filter(
      (p) =>
        p.lat != null && p.lng != null && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng)) &&
        Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180
    );

    valid.forEach((p) => {
      try {
      const guaranteed = p.trust_tier === "naver";
      const icon = L.divIcon({
        className: "",
        html: `<div class="map-pin ${guaranteed ? "" : "kakao"}" title="${esc(p.name)}"></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const kakao = p.kakao_url || `https://map.kakao.com/link/search/${encodeURIComponent(p.name)}`;
      const naver =
        p.naver_url ||
        `https://map.naver.com/p/search/${encodeURIComponent(`${(p.region || "").split(" ").pop()} ${p.name}`)}`;

      const m = L.marker([Number(p.lat), Number(p.lng)], { icon }).addTo(layer.current);
      pins.current.set(String(p.id), m);
      m.bindPopup(
        `<div style="font-family:Pretendard Variable,sans-serif;min-width:200px;letter-spacing:-.2px">
          <div style="display:flex;gap:4px;margin-bottom:4px">
            ${p.is_food ? '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:#fdf0e6;color:#b4560f">🍜 음식</span>' : ""}
            ${p.is_mood ? '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:#efeafd;color:#6d43c9">✨ 분위기</span>' : ""}
            ${guaranteed ? '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:#3182f6;color:#fff">보장</span>' : ""}
          </div>
          <div style="font-weight:700;font-size:15px;margin-bottom:3px">${esc(p.name)}</div>
          <div style="font-size:12px;color:#4e5968;line-height:1.5;margin-bottom:9px">
            ${esc(String(p.highlight || `★${p.kakao_rating} · 리뷰 ${p.kakao_reviews}개`).slice(0, 70))}
          </div>
          <a href="${kakao}" target="_blank" rel="noreferrer"
             style="display:block;text-align:center;background:#3182f6;color:#fff;padding:9px 0;border-radius:11px;font-size:12.5px;font-weight:600;text-decoration:none">
            카카오맵에서 보기
          </a>
          <a href="${naver}" target="_blank" rel="noreferrer"
             style="display:block;text-align:center;background:#e7f8ee;color:#059142;padding:9px 0;border-radius:11px;font-size:12.5px;font-weight:600;text-decoration:none;margin-top:5px">
            네이버지도에서 보기
          </a>
        </div>`
      );
      } catch (e) {
        console.warn("pin skipped:", p?.name, e);
      }
    });

    if (valid.length) {
      try {
        const b = L.latLngBounds(valid.map((p) => [Number(p.lat), Number(p.lng)]));
        map.current.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
      } catch {}
    }
  }

  return <div ref={box} className="map" aria-label="맛집 지도" />;
}
