// Recherche dans la liste des arrêts (pour l'instant) ; les adresses et lieux viendront s'y ajouter à l'étape 4.

export function normaliser(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`\-–—_.,/()]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Arrêts affichés les plus utiles à proposer avant toute saisie. */
export const PRINCIPAUX = [
  "ploermel-gare-routiere-de-rehumpol", "ploermel-centre", "josselin-pem-saint-jacques",
  "mauron-mairie-restaurant-scolaire", "josselin-place-des-remparts",
];

export function construireIndex(data) {
  return Object.entries(data.arrets).map(([id, a]) => ({
    id, nom: a.nom, commune: a.commune, complet: a.complet, lignes: a.lignes,
    cle: normaliser(a.nom + " " + a.commune), communeN: normaliser(a.commune), nomN: normaliser(a.nom),
  }));
}

/** Retourne les arrêts qui correspondent, les plus pertinents d'abord. */
export function rechercher(index, texte, max = 8) {
  const q = normaliser(texte);
  if (!q) return [];
  const mots = q.split(" ");
  const res = [];
  for (const a of index) {
    if (!mots.every((m) => a.cle.includes(m))) continue;
    let score = 0;
    if (a.cle.startsWith(q)) score += 6;
    if (a.nomN.startsWith(q)) score += 4;
    if (a.communeN.startsWith(q)) score += 3;
    for (const m of mots) if (a.cle.split(" ").some((w) => w.startsWith(m))) score += 1;
    res.push({ ...a, score });
  }
  return res.sort((x, y) => y.score - x.score || x.complet.localeCompare(y.complet, "fr")).slice(0, max);
}

export function principaux(index) {
  return PRINCIPAUX.map((id) => index.find((a) => a.id === id)).filter(Boolean);
}
