import "./globals.css";
import { SITE_NAME, SITE_TAGLINE } from "../lib/constants";

export const metadata = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description:
    "카카오맵 평점·리뷰와 네이버 플레이스 재방문 데이터를 교차 검증해 통과한 맛집만 보여드립니다.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
