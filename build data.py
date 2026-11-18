#!/usr/bin/env python3
"""
Construit riv.json à partir d'un fichier GTFS (zip).

Usage :
    python3 build_data.py CHEMIN/vers/gtfs.zip [--agence RIV] [--sortie riv.json]

Le fichier GTFS peut être l'export régional complet (seule l'agence RIV est
gardée) ou un extrait. Seule la bibliothèque standard de Python est utilisée.

Chaque rentrée :
  1. récupérer le nouveau GTFS ;
  2. lancer ce script ;
  3. si un nouvel arrêt apparaît, le script s'arrête et liste les quais à
     ajouter dans quais_vers_arrets.csv (nom affiché + commune) ;
  4. relancer, puis exécuter les tests (voir README).
"""
import argparse, csv, io, json, sys, zipfile, datetime, os

# Le fichier source donne une couleur brune pour la ligne 5 ; le feuillet
# imprimé utilise du violet. On suit le feuillet pour l'affichage.
COULEURS_AFFICHAGE = {"5": "7B4FA0"}


def lire(z, nom):
    """Itère sur les lignes d'un fichier CSV du zip (flux, sans tout charger)."""
    with z.open(nom) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))


def secondes(hhmmss):
    h, m, s = hhmmss.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def dates_service(z, noms, services):
    """Retourne {service_id: [dates ISO]} depuis calendar.txt et/ou calendar_dates.txt."""
    dates = {s: set() for s in services}
    if "calendar.txt" in noms:
        jours = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for r in lire(z, "calendar.txt"):
            if r["service_id"] not in dates:
                continue
            d = datetime.datetime.strptime(r["start_date"], "%Y%m%d").date()
            fin = datetime.datetime.strptime(r["end_date"], "%Y%m%d").date()
            while d <= fin:
                if r[jours[d.weekday()]] == "1":
                    dates[r["service_id"]].add(d)
                d += datetime.timedelta(days=1)
    if "calendar_dates.txt" in noms:
        for r in lire(z, "calendar_dates.txt"):
            if r["service_id"] not in dates:
                continue
            d = datetime.datetime.strptime(r["date"], "%Y%m%d").date()
            (dates[r["service_id"]].add if r["exception_type"] == "1" else dates[r["service_id"]].discard)(d)
    return {s: sorted(x.isoformat() for x in v) for s, v in dates.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gtfs")
    ap.add_argument("--agence", default="RIV")
    ap.add_argument("--sortie", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "riv.json"))
    ap.add_argument("--table", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "quais_vers_arrets.csv"))
    a = ap.parse_args()
    ag = a.agence

    z = zipfile.ZipFile(a.gtfs)
    noms = set(z.namelist())

    # --- lignes
    lignes = {}
    route_vers_ligne = {}
    for r in lire(z, "routes.txt"):
        if r["agency_id"] == ag:
            court = r["route_short_name"] or r["route_id"]
            route_vers_ligne[r["route_id"]] = court
            lignes[court] = {"couleur": COULEURS_AFFICHAGE.get(court, r["route_color"] or "888888")}
    if not lignes:
        sys.exit(f"Aucune ligne pour l'agence {ag}.")

    # --- courses (voyages)
    courses = {}
    for r in lire(z, "trips.txt"):
        if r["route_id"] in route_vers_ligne:
            courses[r["trip_id"]] = {"id": r["trip_id"], "ligne": route_vers_ligne[r["route_id"]],
                                     "sens": int(r["direction_id"] or 0), "service": r["service_id"], "_st": []}
    for r in lire(z, "stop_times.txt"):
        c = courses.get(r["trip_id"])
        if c is not None:
            arr = secondes(r["arrival_time"] or r["departure_time"])
            dep = secondes(r["departure_time"] or r["arrival_time"])
            c["_st"].append((int(r["stop_sequence"]), r["stop_id"], arr, dep))
    quais_utilises = {s[1] for c in courses.values() for s in c["_st"]}

    # --- coordonnées des quais
    coord = {}
    for r in lire(z, "stops.txt"):
        if r["stop_id"] in quais_utilises:
            coord[r["stop_id"]] = (float(r["stop_lat"]), float(r["stop_lon"]), r["stop_name"])

    # --- table de noms validée (quais_vers_arrets.csv)
    table = {}
    with open(a.table, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            table[r["stop_id"]] = r
    manquants = sorted(q for q in quais_utilises if q not in table)
    if manquants:
        print("Quais absents de quais_vers_arrets.csv :", file=sys.stderr)
        for q in manquants:
            print(f"  {q}  ({coord[q][2]})", file=sys.stderr)
        sys.exit("Ajoutez ces quais à la table (arret_id, nom_affiche, commune) puis relancez.")

    quais, arrets = {}, {}
    for q in sorted(quais_utilises):
        t = table[q]
        lat, lon, _ = coord[q]
        quais[q] = {"arret": t["arret_id"], "lat": round(lat, 6), "lon": round(lon, 6),
                    "quai": t.get("quai") or "", "precision": t.get("sens_precision") or ""}
        x = arrets.setdefault(t["arret_id"], {"nom": t["nom_affiche"], "commune": t["commune"],
                                              "complet": t["nom_complet"], "quais": [], "lignes": set(), "_pts": []})
        x["quais"].append(q)
        x["_pts"].append((lat, lon))

    sortie = []
    for c in sorted(courses.values(), key=lambda c: c["id"]):
        st = sorted(c.pop("_st"))
        if len(st) < 2:
            continue
        c["arrets"] = [[s[1], s[2], s[3]] for s in st]          # [quai, arrivée, départ]
        for s in st:
            arrets[quais[s[1]]["arret"]]["lignes"].add(c["ligne"])
        sortie.append(c)
    for x in arrets.values():
        pts = x.pop("_pts")
        x["lat"] = round(sum(p[0] for p in pts) / len(pts), 6)
        x["lon"] = round(sum(p[1] for p in pts) / len(pts), 6)
        x["lignes"] = sorted(x["lignes"])

    # --- changements à pied : quais d'un même arrêt + liens déclarés dans le GTFS
    paires = set()
    for x in arrets.values():
        for q1 in x["quais"]:
            for q2 in x["quais"]:
                if q1 < q2:
                    paires.add((q1, q2))
    if "transfers.txt" in noms:
        for r in lire(z, "transfers.txt"):
            f_, t_ = r["from_stop_id"], r["to_stop_id"]
            if f_ in quais and t_ in quais and f_ != t_ and r["transfer_type"] != "3":
                paires.add(tuple(sorted((f_, t_))))

    services = dates_service(z, noms, {c["service"] for c in sortie})
    toutes = sorted(d for ds in services.values() for d in ds)
    data = {
        "meta": {"agence": ag, "source": os.path.basename(a.gtfs), "genere": datetime.date.today().isoformat()},
        "valide_du": toutes[0], "valide_au": toutes[-1],
        "lignes": lignes, "arrets": arrets, "quais": quais,
        "courses": sortie, "services": services, "transferts": sorted(paires),
    }
    with open(a.sortie, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(lignes)} lignes, {len(arrets)} arrêts, {len(quais)} quais, {len(sortie)} courses, "
          f"{len(paires)} changements à pied, service du {data['valide_du']} au {data['valide_au']} "
          f"-> {a.sortie} ({os.path.getsize(a.sortie)//1024} Ko)")


if __name__ == "__main__":
    main()
