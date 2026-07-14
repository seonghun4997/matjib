import "./globals.css";
import { SITE_NAME, SITE_TAGLINE } from "../lib/constants";

const DESC = "카카오맵 평점·리뷰와 네이버 재방문 데이터를 교차 검증해, 진짜 맛집만 지도에 모았어요.";

export const metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: DESC,
  keywords: ["맛집", "맛집추천", "동네맛집", "맛집지도", "재방문", "검증맛집"],
  openGraph: {
    title: `${SITE_NAME} — 검증된 맛집만 모았어요`,
    description: DESC,
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DESC },
  robots: { index: true, follow: true },
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#3182f6" };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
