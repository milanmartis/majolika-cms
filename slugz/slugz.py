#!/usr/bin/env python3
"""
Vyplní prázdne slugs v tabuľke `products` a postará sa o ich jedinečnosť.

• Diakritika a špeciálne znaky sú odstránené pomocou python-slugify.
• Ak sa vygenerovaný slug už nachádza v databáze, pridá sa prípona -1, -2, …
• Na konci sa zmeny trvalo uložia (COMMIT).

Použitie:
    python slugify_products.py               # products.db je v tom istom priečinku
    python slugify_products.py cesta/ku/db.sqlite
"""

from __future__ import annotations
import sys
import sqlite3
from pathlib import Path
from slugify import slugify # type: ignore

DB_PATH = Path(sys.argv[1] if len(sys.argv) > 1 else "../.tmp/data.db")


def make_unique(base: str, existing: set[str]) -> str:
    """
    Vráti `base`, pokiaľ je voľný; inak pridáva -1, -2, …
    """
    if base not in existing:
        return base
    i = 1
    while True:
        candidate = f"{base}-{i}"
        if candidate not in existing:
            return candidate
        i += 1


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 1) Slugs, ktoré už databáza používa
    cur.execute("SELECT slug FROM products WHERE slug IS NOT NULL AND slug <> ''")
    taken: set[str] = {row["slug"] for row in cur}

    # 2) Riadky, kde slug chýba
    cur.execute("SELECT id, name FROM products WHERE slug IS NULL OR slug = ''")
    rows = cur.fetchall()
    if not rows:
        print("✔️  Žiadne prázdne slugy – databáza je OK.")
        conn.close()
        return

    print(f"🔧 Dopĺňam slugy pre {len(rows)} záznamov …")

    updates: list[tuple[str, int]] = []
    for row in rows:
        base = slugify(row["name"], lowercase=True)          # napr. „Čierna Váza“ → „cierna-vaza“
        unique = make_unique(base, taken)
        taken.add(unique)                                    # zarezervujeme si ho
        updates.append((unique, row["id"]))

    # 3) Hromadný UPDATE
    cur.executemany("UPDATE products SET slug = ? WHERE id = ?", updates)
    conn.commit()
    conn.close()

    print(f"✅ Hotovo! Doplnených slugov: {len(updates)}")


if __name__ == "__main__":
    main()
