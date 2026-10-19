# SeguimentJaCat

Projecte de captura i visualització de les estadístiques dels enllaços de ja.cat.

## Flux de dades

1. Enganxa la còpia de ja.cat a la pestanya `Buidat` del full «Seguiment de ja.cat».
2. En enganxar la taula a partir de la cel·la A1, el full importa les dades a `Historial` i buida `Buidat` quan la importació s'ha completat. També es pot executar des del menú «Seguiment ja.cat».
3. El dashboard llegeix `Historial` i mostra els totals, el rànquing, els enllaços més visitats i les variacions entre captures.

Cada fila s’identifica per l’URL escurçada normalitzada (sense protocol, `www`, barra final ni paràmetres). L’ordre de les files de `Buidat` no intervé; `Historial` queda ordenat per app i àlies. Els enllaços nous s’afegeixen, les files omeses conserven les dades del dia i una URL duplicada provoca un avís sense buidar `Buidat`.

## Accés i privacitat

El dashboard és una app web d'Apps Script desplegada perquè només el compte que la publica hi tingui accés (`MYSELF`). L'enllaç és al menú web, però Google n'exigeix l'inici de sessió al compte autoritzat.

## Desenvolupament

- Apps Script: `Code.js`, `Dashboard.html` i `appsscript.json`.
- Icones: `icon.svg` i `favicon.svg`; el favicon del menú principal és a l'arrel del repositori.
- Gestiona els fitxers d'Apps Script amb `clasp` des d'aquesta carpeta. El fitxer local `.clasp.json` no es publica al repositori.
