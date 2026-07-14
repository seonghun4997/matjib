// ═══════════════════════════════════════════════
//  자동 갱신 — 매일 새벽 3시 (Vercel Cron)
//   ① 고객이 요청한 새 동네 수집
//   ② 오래된 동네 재수집 (평점·태그·의심도 최신화)
//   ③ 실행 이력을 runs 에 기록 → 어드민 대시보드에서 확인
//
//  수동 실행: /api/cron?key=<ADMIN_PASS>
// ═══════════════════════════════════════════════
import { searchRegion, sleep } from "../../../lib/kakao";
import { serverClient } from "../../../lib/supabase";
import { DEFAULTS } from "../../../lib/config";
import { collectOne } from "../collect/route";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const isCron = (req.headers.get("user-agent") || "").includes("vercel-cron");
  const keyOk = url.searchParams.get("key") === (process.env.NEXT_PUBLIC_ADMIN_PASS || "matjib");
  if (!isCron && !keyOk) return Response.json({ error: "권한 없음" }, { status: 401 });

  const sb = serverClient();
  if (!sb) return Response.json({ error: "Supabase 환경변수 없음" }, { status: 500 });

  const { data: st } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
  const s = { ...DEFAULTS, ...(st || {}) };

  const { data: run } = await sb
    .from("runs")
    .insert({ kind: isCron ? "auto" : "manual" })
    .select("id")
    .single();

  const report = { regions: [], checked: 0, saved: 0, hidden: 0, errors: 0 };

  try {
    // ① 고객 요청 동네 (요청 많은 순) 최대 2곳
    const { data: reqs } = await sb
      .from("regions")
      .select("id,name,request_count")
      .eq("status", "requested")
      .order("request_count", { ascending: false })
      .limit(2);

    // ② 오래된 동네 최대 2곳
    const cutoff = new Date(Date.now() - Number(s.auto_refresh_days) * 86400 * 1000).toISOString();
    const { data: stale } = await sb
      .from("regions")
      .select("id,name,last_collected_at")
      .eq("status", "ready")
      .or(`last_collected_at.is.null,last_collected_at.lt.${cutoff}`)
      .order("last_collected_at", { ascending: true, nullsFirst: true })
      .limit(2);

    const targets = [...(reqs || []), ...(stale || [])];
    let budget = Number(s.auto_budget) || 60;

    for (const t of targets) {
      if (budget <= 0) break;
      const rr = { region: t.name, checked: 0, saved: 0, hidden: 0 };
      await sb.from("regions").update({ status: "collecting" }).eq("id", t.id);

      try {
        const candidates = await searchRegion(t.name);
        for (const c of candidates) {
          if (budget <= 0) break;
          budget--;
          rr.checked++;
          report.checked++;
          try {
            const r = await collectOne(c.kakao_id, t.name, c);
            if (r.saved) {
              rr.saved++;
              report.saved++;
              if (r.hidden) {
                rr.hidden++;
                report.hidden++;
              }
            }
          } catch {
            report.errors++;
          }
          await sleep(350);
        }

        const { count } = await sb
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("region", t.name)
          .eq("status", "live");

        await sb
          .from("regions")
          .update({ status: "ready", last_collected_at: new Date().toISOString(), place_count: count || 0 })
          .eq("id", t.id);
      } catch (e) {
        await sb.from("regions").update({ status: "ready" }).eq("id", t.id);
        report.errors++;
      }
      report.regions.push(rr);
    }

    if (run?.id) {
      await sb
        .from("runs")
        .update({
          regions: report.regions.map((r) => r.region),
          checked: report.checked,
          saved: report.saved,
          hidden: report.hidden,
          errors: report.errors,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    return Response.json(report);
  } catch (e) {
    if (run?.id) {
      await sb
        .from("runs")
        .update({ note: String(e?.message || e), finished_at: new Date().toISOString() })
        .eq("id", run.id);
    }
    return Response.json({ ...report, error: String(e?.message || e) }, { status: 500 });
  }
}
