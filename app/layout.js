import "./globals.css";
import { SITE } from "../lib/config";

// 카톡·페이스북 등에 링크를 공유할 때 뜨는 미리보기 설정.
// metadataBase가 없으면 og:image가 상대경로로 나가 수집기가 이미지를 못 찾는다 (= 카톡에 이미지 안 뜸).
// 대표 이미지는 app/opengraph-image.png (1200×630)를 Next가 자동으로 붙여준다.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://matjib-jari3.vercel.app";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  keywords: ["맛집", "맛집추천", "동네맛집", "맛집지도", "재방문", "검증맛집"],
  openGraph: {
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE_URL,
    type: "website",
    locale: "ko_KR",
    siteName: SITE.name,
  },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description },
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
