/* Public site data. Laure edits the Google Sheet; the site derives technical
   identifiers, ordering, availability and badges from the readable columns. */
window.SiteData = (() => {
  const spreadsheetId = "1yun-qS8TDI-II8BNatOI5oRrwfWl5Oep5-H1StvEJeE";
  const tabs = {
    SITE: "1098918812",
    PLATS: "2056572397",
    "CRÉNEAUX": "1555121259",
  };

  const tints = [
    ["#E8CDB4", "#D2A97F"], ["#EFCFC0", "#D89A82"], ["#EFE0C8", "#D8C49A"],
    ["#F0DBB8", "#DDB472"], ["#E4E7D4", "#B9C3A0"], ["#E9DDCF", "#C9B49C"],
    ["#F1CFBB", "#DE9B70"], ["#E0CFC2", "#B69684"], ["#F2DDC0", "#E0AE70"],
  ];

  const cell = (row, key) => row[key] == null ? "" : String(row[key]).trim();
  const number = (value) => Number(String(value).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) || 0;
  const yes = (value) => ["oui", "yes", "true", "1"].includes(String(value).trim().toLowerCase());
  const key = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const slug = (value) => key(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "element";

  function endpoint(sheetId) {
    return `/api/catalogue?gid=${sheetId}`;
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
      else if (char === "," && !quoted) { row.push(value); value = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
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
    const required = {
      SITE: ["Section", "Élément", "Valeur"],
      PLATS: ["Nom du plat", "Actif", "Format 1 personne actif"],
      "CRÉNEAUX": ["Date", "Heure", "Actif", "Places disponibles"]
    }[sheetName] || [];
    if (required.some((name) => !headers.includes(name))) {
      throw new Error(`En-têtes du catalogue incorrects pour l'onglet ${sheetName}`);
    }
    return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }

  function driveImageUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return `https://lh3.googleusercontent.com/d/${match[1]}=w1600`;
    return /^https?:\/\//i.test(url) ? url : "";
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!match) return raw;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 12), Number(match[5] || 0));
    const dateText = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(date);
    return match[4] ? `${dateText} à ${match[4]}h${match[5] === "00" ? "" : match[5]}` : dateText;
  }

  function buildSite(rows) {
    const activeRows = rows.filter((row) => !cell(row, "Actif") || yes(cell(row, "Actif")));
    const find = (section, element) => activeRows.find((row) => key(cell(row, "Section")) === key(section) && key(cell(row, "Élément")) === key(element));
    const value = (section, element, column = "Valeur") => cell(find(section, element) || {}, column);
    const blockFilters = [{ conservation: "Frais" }, {}, { conservation: "Surgelé" }, { format: "2 personnes" }];
    const moments = [1, 2, 3, 4].map((index) => find("BLOCS COMMERCIAUX", `Bloc ${index}`)).filter(Boolean).map((row, index) => ({
      icon: ["assiette", "calendrier", "flocon", "cadeau"][index],
      titre: cell(row, "Valeur"), texte: cell(row, "Texte complémentaire"), lien: cell(row, "Bouton / lien"), filtre: blockFilters[index],
    }));
    const engagements = activeRows.filter((row) => key(cell(row, "Section")) === "engagements").map((row, index) => ({
      icon: ["marmite", "barquettes", "liste", "thermometre", "epingle"][index] || "liste",
      titre: cell(row, "Valeur"), texte: cell(row, "Texte complémentaire"),
    }));
    const settings = {
      "identite.nom": value("IDENTITÉ", "Nom commercial"),
      "identite.signature": value("IDENTITÉ", "Signature"),
      "asset.logo": driveImageUrl(value("IDENTITÉ", "Logo Google Drive")),
      "contact.telephone": value("IDENTITÉ", "Téléphone"),
      "contact.email": value("IDENTITÉ", "Email"),
      "contact.instagram": value("IDENTITÉ", "Instagram"),
      "contact.facebook": value("IDENTITÉ", "Facebook"),
      "retrait.zone": value("RETRAIT", "Zone de retrait"),
      "retrait.communes": value("RETRAIT", "Communes"),
      "retrait.adresse_mode": value("RETRAIT", "Message adresse"),
      "paiement.modes": value("RETRAIT", "Moyens de paiement"),
      "commande.delai_reponse": value("RETRAIT", "Délai de confirmation"),
      "stock.seuil": number(value("STOCK", "Seuil presque épuisé")) || 3,
      "commande.afficher_stock": "Oui",
    };
    const textes = {
      "identite.nom": settings["identite.nom"],
      "accueil.hero.badge": value("ACCUEIL", "Badge d'introduction"),
      "accueil.hero.titre": value("ACCUEIL", "Titre principal"),
      "accueil.hero.texte": value("ACCUEIL", "Texte d'introduction", "Texte complémentaire"),
      "accueil.hero.cta": value("ACCUEIL", "Bouton principal"),
      "accueil.hero.cta2": value("ACCUEIL", "Bouton secondaire"),
      "footer.signature": settings["identite.signature"],
      "footer.retrait": `${settings["retrait.zone"]} · ${settings["retrait.adresse_mode"]}`,
    };
    return { settings, textes, moments, engagements };
  }

  function buildPlats(rows, threshold) {
    const definitions = [
      { id: "indiv", label: "1 personne", active: "Format 1 personne actif", weight: "Poids 1 personne", price: "Prix 1 personne", stock: "Stock 1 personne" },
      { id: "duo", label: "2 personnes", active: "Format 2 personnes actif", weight: "Poids 2 personnes", price: "Prix 2 personnes", stock: "Stock 2 personnes" },
      { id: "fam", label: "4 personnes", active: "Format 4 personnes actif", weight: "Poids 4 personnes", price: "Prix 4 personnes", stock: "Stock 4 personnes" },
    ];
    return rows.filter((row) => yes(cell(row, "Actif")) && cell(row, "Nom du plat")).map((row, index) => {
      const variants = definitions.filter((definition) => definition.id !== 'fam' && yes(cell(row, definition.active))).map((definition) => ({
        id: definition.id, label: definition.label, detail: cell(row, definition.weight), prix: number(cell(row, definition.price)), stock: number(cell(row, definition.stock)),
      }));
      const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);
      const retraitRaw = cell(row, "Disponible à partir du");
      const limiteRaw = cell(row, "Commander avant le");
      const preorder = Boolean(retraitRaw && limiteRaw);
      const low = !preorder && stock > 0 && stock <= threshold;
      const state = cell(row, "État actuel") || "Frais";
      const canFreeze = yes(cell(row, "Peut être congelé"));
      const badges = [];
      if (yes(cell(row, "Incontournable"))) badges.push("Incontournable");
      if (preorder) badges.push(`Précommande · dès ${formatDate(retraitRaw)}`);
      else if (stock > 0) badges.push("Disponible maintenant");
      if (low) badges.push("Presque épuisé");
      if (state === "Surgelé") badges.push("Surgelé");
      const photos = ["Photo principale URL Google Drive", "Photo 2 facultative", "Photo 3 facultative"].map((column) => driveImageUrl(cell(row, column))).filter(Boolean);
      return {
        id: slug(cell(row, "Nom du plat")), nom: cell(row, "Nom du plat"), desc: cell(row, "Description courte"), categorie: cell(row, "Catégorie"),
        featured: yes(cell(row, "Mise en avant")), ordre: number(cell(row, "Ordre d'affichage")), conservation: state,
        conservations: [state, ...(canFreeze && state !== "Surgelé" ? ["Surgelé"] : [])],
        dispo: preorder ? "preco" : stock <= 0 ? "soldout" : low ? "low" : "now", reste: stock,
        retrait: formatDate(retraitRaw), limite: formatDate(limiteRaw), tint: tints[index % tints.length], photos, badges, variants,
        descLongue: cell(row, "Description longue"), ingredients: cell(row, "Ingrédients"), allergenes: cell(row, "Allergènes"),
        dlc: cell(row, "DLC / conservation"), rechauffage: cell(row, "Réchauffage"), poids: variants.map((variant) => `${variant.label} : ${variant.detail}`).join(" · "),
      };
    }).filter((plat) => plat.variants.length).sort((a, b) => Number(b.featured) - Number(a.featured) || a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"));
  }

  function buildFormules(rows) {
    return rows.filter((row) => yes(cell(row, "Actif"))).map((row) => ({
      id: slug(cell(row, "Nom") || cell(row, "ID formule")), tag: cell(row, "Tag"), nom: cell(row, "Nom"), contenu: cell(row, "Contenu"),
      prix: number(cell(row, "Prix TTC")), prixDetail: cell(row, "Détail du prix"), populaire: yes(cell(row, "Populaire")),
      points: [cell(row, "Argument 1"), cell(row, "Argument 2"), cell(row, "Argument 3")].filter(Boolean),
    }));
  }

  function buildJours(rows) {
    const groups = new Map();
    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(now);
    const clockNow = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
    const nowISO = today+'T'+clockNow;
    const clock = value=>{const m=String(value||'').trim().match(/^([01]?\d|2[0-3])(?:h|:)([0-5]\d)$/);return m?m[1].padStart(2,'0')+':'+m[2]:'';};
    const fmt = value=>value.replace(':','h');
    function toIso(raw){
      const text=String(raw||'').trim();
      if(/^\d{4}-\d\d-\d\d/.test(text))return text.slice(0,10);
      const fr=text.match(/^(\d\d)\/(\d\d)\/(\d{4})/);
      return fr?fr[3]+'-'+fr[2]+'-'+fr[1]:'';
    }
    function cutoffIso(value){
      const text=String(value||'').trim();
      const iso=text.match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)/);
      if(iso)return iso[1]+'T'+iso[2];
      const fr=text.match(/^(\d\d)\/(\d\d)\/(\d{4})[ T,]+(\d\d:\d\d)/);
      return fr?fr[3]+'-'+fr[2]+'-'+fr[1]+'T'+fr[4]:'';
    }
    rows.filter(row=>yes(cell(row,'Actif'))&&number(cell(row,'Places disponibles'))>0)
      .map(row=>({...row,_iso:toIso(cell(row,'Date')),_clock:clock(cell(row,'Heure'))}))
      .filter(row=>row._iso&&row._clock&&row._iso+'T'+row._clock>nowISO)
      .filter(row=>{const cutoff=cutoffIso(cell(row,'Clôture commandes'));return !cutoff||cutoff>nowISO;})
      .sort((a,b)=>a._iso.localeCompare(b._iso)||a._clock.localeCompare(b._clock))
      .forEach(row=>{
        const dateRaw=row._iso,start=fmt(row._clock),endClock=clock(cell(row,'Heure fin'));
        const end=endClock?fmt(endClock):'';
        const cutoff=cutoffIso(cell(row,'Clôture commandes'));
        const id=slug(dateRaw);
        const current=groups.get(id)||{id,jour:cell(row,'Jour'),date:formatDate(dateRaw),dateRaw,creneaux:[]};
        current.creneaux.push({id:slug(dateRaw+'-'+start),label:end?start+' – '+end:start,start,end,cutoff,
          restant:number(cell(row,'Places disponibles'))});
        groups.set(id,current);
      });
    return [...groups.values()].map(day=>({...day,plage:day.creneaux.map(c=>c.label).join(' · ')}));
  }

  function buildData(source) {
    const site = buildSite(source.SITE);
    const etapes = [
      { n: "1", icon: "marmite", titre: "Laure cuisine", texte: "Je prépare des plats en petite quantité et je mets les disponibilités à jour." },
      { n: "2", icon: "barquettes", titre: "Vous choisissez", texte: "Vous remplissez votre panier, vous choisissez un jour et un créneau de retrait." },
      { n: "3", icon: "message", titre: "Laure confirme", texte: "Je vérifie ce qu'il me reste et je vous confirme par SMS." },
      { n: "4", icon: "main", titre: "Vous récupérez", texte: "Vous passez au créneau choisi, vous payez sur place." },
    ];
    return {
      plats: buildPlats(source.PLATS, site.settings["stock.seuil"]), formules: [], // Formules désactivées : onglet non requis
      moments: site.moments, etapes, engagements: site.engagements, jours: buildJours(source["CRÉNEAUX"]),
      settings: site.settings, textes: site.textes,
    };
  }

  async function load() {
    const entries = await Promise.all(Object.entries(tabs).map(async ([tab, gid]) => [tab, await readTab(tab, gid)]));
    return buildData(Object.fromEntries(entries));
  }

  return { spreadsheetId, load };
})();