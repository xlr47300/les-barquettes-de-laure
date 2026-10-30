// Lecture publique du catalogue Google Sheets depuis Cloudflare Pages.
// Seuls les quatre onglets publics du site sont accessibles.
const SHEET_ID = "1yun-qS8TDI-II8BNatOI5oRrwfWl5Oep5-H1StvEJeE";
const ALLOWED_GIDS = new Set([
  "1098918812", // SITE
  "2056572397", // PLATS
  "1673314679", // FORMULES
  "1555121259"  // CRÉNEAUX
]);

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const gid = url.searchParams.get("gid");

  if (!ALLOWED_GIDS.has(gid)) {
    return new Response("Onglet inconnu", { status: 400 });
  }

  try {
    const source = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&range=A4:AZ1000`;
    const upstream = await fetch(source, {
      redirect: "follow",
      headers: { Accept: "text/csv" }
    });

    if (!upstream.ok) {
      return new Response("Catalogue indisponible", { status: 502 });
    }

    const csv = await upstream.text();
    if (/^\s*<!doctype html|^\s*<html/i.test(csv)) {
      return new Response("Réponse Google Sheets invalide", { status: 502 });
    }

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return new Response("Lecture du catalogue impossible", { status: 502 });
  }
}
