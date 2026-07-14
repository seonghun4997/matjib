"use client";
import Link from "next/link";

export default function Error({ error, reset }) {
  return (
    <div style={{ maxWidth: 440, margin: "120px auto", padding: 24, textAlign: "center" }}>
      <h1 style={{ fontSize: 19, fontWeight: 800, marginBottom: 10 }}>잠시 문제가 생겼어요</h1>
      <p style={{ fontSize: 13.5, color: "var(--sub)", lineHeight: 1.7, marginBottom: 18 }}>
        새로고침하면 대부분 해결돼요.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={() => reset()}>다시 시도</button>
        <Link href="/" className="btn btn-ghost">홈으로</Link>
      </div>
      {error?.message && (
        <p style={{ fontSize: 11, color: "var(--sub)", marginTop: 20, wordBreak: "break-all" }}>
          {String(error.message).slice(0, 160)}
        </p>
      )}
    </div>
  );
}
