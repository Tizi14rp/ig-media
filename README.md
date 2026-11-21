# ig-media

Repo público servido por GitHub Pages. **Solo contiene media aprobada** (posts mergeados en `ig-brain`),
para que la API oficial de Instagram pueda leerla desde una URL pública.

No editar a mano: lo actualiza una Action de `ig-brain` (fase 2). Estructura: `posts/AAAA-MM-DD/<archivo>`.

## App de aprobación (`app/`)

Mini app web instalable (PWA) para aprobar o rechazar los posts desde el celular:
<https://tizi14rp.github.io/ig-media/app/>. No contiene datos: lee los PR del repo privado `ig-brain`
con un token que el dueño guarda solo en su dispositivo. Probar sin token: `…/app/?demo=1`.
