/* Global configuration for the public site. Update the spreadsheet ID only if
   the source Google Sheet is replaced. Content itself stays in Google Sheets. */
window.SiteData = (() => {
  const spreadsheetId = "1yun-qS8TDI-II8BNatOI5oRrwfWl5Oep5-H1StvEJeE";
  const tabs = {
    "Réglages": "1098918812",
    "Plats": "2056572397",
    "Formats et prix": "511983109",
    "Nutrition": "132549998",
    "Formules": "1673314679",
    "Créneaux": "1555121259",
    "Contenus": "739882070",
    "Textes du site": "408664652",
  };

  const cell = (row, key) => row[key] == null ? "" : String(row[key]).trim();
  const number = (value) => Number(String(value).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) || 0;
  const yes = (value) => ["oui", "yes", "true", "1"].includes(String(value).trim().toLowerCase());
  const split = (value) => cell({ value }, "value").split("|").map((item) => item.trim()).filter(Boolean);

  function endpoint(sheetId) {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheetId}&range=A4:AZ1000`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(value); value = ""; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[index + 1] === '\n') index += 1;
        row.push(value);
        if (row.some(Boolean)) rows.push(row);
        row = [];
        value = "";
      } else value += char;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    return rows;
  }

  async function readTab(sheetName, sheetId) {
    const response = await fetch(endpoint(sheetId), { cache: "no-store" });
    if (!response.ok) throw new Error(`Lecture impossible pour l'onglet ${sheetName}`);
    const rows = parseCsv(await response.text());
    const headers = rows.shift() || [];
    return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }

  function availability(value) {
    const normalized = String(value).toLowerCase();
    if (normalized.includes("précommande")) return "preco";
    if (normalized.includes("faible")) return "low";
    return "now";
  }

  function buildData(source) {
    const settings = Object.fromEntries(source["Réglages"].map((row) => [cell(row, "Clé"), cell(row, "Valeur actuelle")]));
    const formatsByDish = new Map();
    source["Formats et prix"].filter((row) => yes(cell(row, "Actif"))).forEach((row) => {
      const id = cell(row, "ID plat");
      const formats = formatsByDish.get(id) || [];
      formats.push({
        id: cell(row, "ID format"),
        label: cell(row, "Nom du format"),
        detail: cell(row, "Poids / volume"),
        prix: number(cell(row, "Prix TTC")),
        ordre: number(cell(row, "Ordre")),
      });
      formatsByDish.set(id, formats);
    });

    const nutritionByDish = new Map();
    source["Nutrition"].forEach((row) => {
      const id = cell(row, "ID plat");
      const values = nutritionByDish.get(id) || [];
      values.push({ valeur: cell(row, "Valeur affichée"), label: cell(row, "Indicateur"), ordre: number(cell(row, "Ordre")) });
      nutritionByDish.set(id, values);
    });

    const plats = source.Plats.filter((row) => yes(cell(row, "Actif"))).map((row) => {
      const id = cell(row, "ID plat");
      const conservation = cell(row, "Conservation principale");
      const conservations = [conservation, ...split(cell(row, "Conservations proposées"))]
        .filter((value, index, values) => value && values.indexOf(value) === index);
      return {
        id,
        nom: cell(row, "Nom"),
        desc: cell(row, "Description courte"),
        categorie: cell(row, "Catégorie"),
        conservation,
        conservations,
        dispo: availability(cell(row, "Disponibilité")),
        reste: number(cell(row, "Stock")),
        retrait: cell(row, "Date de retrait"),
        limite: cell(row, "Date limite"),
        tint: [cell(row, "Couleur 1") || "#E8CDB4", cell(row, "Couleur 2") || "#D2A97F"],
        photoLabel: cell(row, "Libellé photo"),
        photoBrief: cell(row, "Brief photo"),
        badges: split(cell(row, "Badges (séparés par |)")),
        variants: (formatsByDish.get(id) || []).sort((a, b) => a.ordre - b.ordre),
        descLongue: cell(row, "Description longue"),
        ingredients: cell(row, "Ingrédients"),
        allergenes: cell(row, "Allergènes"),
        dlc: cell(row, "DLC / conservation"),
        rechauffage: cell(row, "Réchauffage"),
        poids: cell(row, "Poids net"),
        nutrition: (nutritionByDish.get(id) || []).sort((a, b) => a.ordre - b.ordre),
      };
    });

    const formules = source.Formules.filter((row) => yes(cell(row, "Actif"))).map((row) => ({
      id: cell(row, "ID formule"),
      tag: cell(row, "Tag"),
      nom: cell(row, "Nom"),
      contenu: cell(row, "Contenu"),
      prix: number(cell(row, "Prix TTC")),
      prixDetail: cell(row, "Détail du prix"),
      populaire: yes(cell(row, "Populaire")),
      points: [cell(row, "Argument 1"), cell(row, "Argument 2"), cell(row, "Argument 3")].filter(Boolean),
    }));

    const byType = (type) => source.Contenus.filter((row) => cell(row, "Type") === type).sort((a, b) => number(cell(a, "Ordre")) - number(cell(b, "Ordre")));
    const moments = byType("Moment").map((row) => {
      let filtre = {};
      try { filtre = JSON.parse(cell(row, "Paramètre") || "{}"); } catch { filtre = {}; }
      return { icon: "assiette", titre: cell(row, "Titre"), texte: cell(row, "Texte"), lien: cell(row, "Lien / bouton"), filtre };
    });
    const etapes = byType("Étape").map((row) => ({ n: String(number(cell(row, "Ordre"))), icon: "marmite", titre: cell(row, "Titre"), texte: cell(row, "Texte") }));
    const engagements = byType("Engagement").map((row) => ({ icon: "liste", titre: cell(row, "Titre"), texte: cell(row, "Texte") }));
    const temoignages = byType("Témoignage").map((row) => ({ texte: cell(row, "Texte"), qui: cell(row, "Auteur / signature") }));

    const days = new Map();
    source["Créneaux"].forEach((row) => {
      const id = cell(row, "ID jour");
      const current = days.get(id) || { id, jour: cell(row, "Jour"), date: cell(row, "Date affichée"), plage: cell(row, "Plage générale"), ordre: number(cell(row, "Ordre jour")), creneaux: [] };
      current.creneaux.push({ id: cell(row, "ID créneau"), label: cell(row, "Horaire"), restant: number(cell(row, "Places restantes")) });
      days.set(id, current);
    });
    const jours = [...days.values()].sort((a, b) => a.ordre - b.ordre);

    const textes = Object.fromEntries(source["Textes du site"].map((row) => [cell(row, "Clé"), cell(row, "Texte actuel")]));
    return { plats, formules, moments, etapes, engagements, temoignages, jours, settings, textes };
  }

  async function load() {
    const entries = await Promise.all(Object.entries(tabs).map(async ([tab, gid]) => [tab, await readTab(tab, gid)]));
    return buildData(Object.fromEntries(entries));
  }

  return { spreadsheetId, load };
})();
