// App de aprobación de posts (PWA). Habla solo con api.github.com usando el token que el dueño guarda en su celular.
// Aprobar = Merge del PR (con el sha que se está viendo). Rechazar = cerrar el PR. Pedir cambios = comentario.
const API = "https://api.github.com";
const DEMO = new URLSearchParams(location.search).has("demo");
const $ = (s, el = document) => el.querySelector(s);

// ---------- almacenamiento local (solo en este dispositivo) ----------
const LS = "ig-aprobar";
const leerConfig = () => { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } };
const guardarConfig = (c) => { try { localStorage.setItem(LS, JSON.stringify(c)); return true; } catch { return false; } };
const borrarConfig = () => { try { localStorage.removeItem(LS); } catch {} };
let cfg = DEMO ? { repo: "demo/ig-brain", token: "demo" } : leerConfig();
let memoriaToken = null; // si localStorage no está disponible, vale para esta sesión

// ---------- API de GitHub ----------
class ErrorApi extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(ruta, { metodo = "GET", cuerpo, raw = false } = {}) {
  if (DEMO) return demoApi(ruta, metodo, cuerpo, raw);
  const token = cfg?.token ?? memoriaToken;
  const res = await fetch(API + ruta, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(cuerpo ? { "Content-Type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new ErrorApi(res.status, msg);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}
const contenido = (ruta, ref) => api(`/repos/${cfg.repo}/contents/${ruta}?ref=${encodeURIComponent(ref)}`, { raw: true });

// ---------- UI ----------
const estado = (t) => { $("#estado").textContent = t || ""; };
function mostrar(vista) {
  $("#v-config").hidden = vista !== "config";
  $("#v-lista").hidden = vista !== "lista";
  $("#btn-recargar").hidden = vista !== "lista";
  $("#btn-salir").hidden = vista !== "lista" || DEMO;
}

function confirmar(titulo, texto, { pedirTexto = false, ok = "Confirmar", obligatorio = false } = {}) {
  const dlg = $("#dlg"), input = $("#dlg-input");
  $("#dlg-titulo").textContent = titulo;
  $("#dlg-texto").textContent = texto;
  $("#dlg-ok").textContent = ok;
  input.hidden = !pedirTexto; input.value = "";
  return new Promise((resolve) => {
    dlg.onclose = () => {
      if (dlg.returnValue !== "si") return resolve(null);
      if (pedirTexto && obligatorio && !input.value.trim()) return resolve(null);
      resolve(pedirTexto ? input.value.trim() : true);
    };
    dlg.showModal();
  });
}

// ---------- configuración ----------
$("#f-config").addEventListener("submit", async (e) => {
  e.preventDefault();
  const repo = $("#in-repo").value.trim(), token = $("#in-token").value.trim();
  $("#config-error").textContent = "";
  cfg = { repo, token };
  try {
    const r = await api(`/repos/${repo}`);
    if (!r.permissions?.push) throw new Error("El token no tiene permiso de escritura en el repo.");
    if (!guardarConfig(cfg)) { memoriaToken = token; estado("Este navegador no deja guardar datos: el token vale hasta que cierres la app."); }
    $("#in-token").value = "";
    cargar();
  } catch (err) {
    cfg = null;
    $("#config-error").textContent = err.status === 401 ? "Token inválido o vencido." : err.status === 404 ? "No encuentro el repo (¿el token tiene acceso a ig-brain?)." : err.message;
  }
});
$("#btn-salir").addEventListener("click", async () => {
  if (await confirmar("Desconectar", "Se borra el token de este celular. Para volver a usar la app vas a tener que pegarlo otra vez.", { ok: "Desconectar" })) {
    borrarConfig(); cfg = null; mostrar("config");
  }
});
$("#btn-recargar").addEventListener("click", () => cargar());

// ---------- lista de posts ----------
const esPost = (pr) => pr.head.ref.startsWith("claude/post-") || /^Post \d{4}-\d{2}-\d{2}/.test(pr.title);
const urlsBlob = [];

async function cargar() {
  mostrar("lista");
  estado("Cargando…");
  urlsBlob.splice(0).forEach(URL.revokeObjectURL);
  const lista = $("#lista"); lista.replaceChildren();
  try {
    const abiertos = (await api(`/repos/${cfg.repo}/pulls?state=open&per_page=30`)).filter(esPost);
    abiertos.sort((a, b) => a.title.localeCompare(b.title));
    estado(abiertos.length ? "" : "No hay posts esperando aprobación. 🎉");
    for (const pr of abiertos) lista.append(await tarjeta(pr));
    cargarResueltos();
  } catch (err) { manejarError(err); }
}

async function tarjeta(pr) {
  const el = $("#t-post").content.firstElementChild.cloneNode(true);
  const sha = pr.head.sha;
  $(".ver-gh", el).href = pr.html_url;
  try {
    const archivos = await api(`/repos/${cfg.repo}/pulls/${pr.number}/files?per_page=100`);
    const planPath = archivos.map((f) => f.filename).find((f) => /^posts\/\d{4}-\d{2}-\d{2}\/plan\.json$/.test(f));
    if (!planPath) throw new Error("El PR no tiene posts/AAAA-MM-DD/plan.json");
    const dir = planPath.replace(/\/plan\.json$/, "");
    const plan = await (await contenido(planPath, sha)).json();
    const caption = await (await contenido(`${dir}/caption.md`, sha)).text();

    $(".formato", el).textContent = { image: "imagen", carousel: "carrusel", reel: "reel" }[plan.format] ?? plan.format;
    $(".pilar", el).textContent = plan.pillar;
    $(".fecha", el).textContent = new Date(plan.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    $(".tema", el).textContent = plan.topic;
    $(".caption", el).textContent = caption.trim();
    $(".hashtags", el).textContent = (plan.hashtags || []).join(" ");
    const datos = $(".datos", el);
    const fila = (k, v) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; datos.append(dt, dd); };
    fila("Alt", plan.altText);
    if (plan.sources?.length) fila("Fuentes", plan.sources.map((s) => `${s.dato} → ${s.fuente}`).join("; "));
    fila("Riesgos", plan.riskFlags?.length ? plan.riskFlags.join("; ") : "ninguno");

    // imágenes (repo privado: se bajan con el token y se muestran como blob)
    const carr = $(".carrusel", el), puntos = $(".puntos", el);
    let faltan = 0;
    for (let i = 1; i <= plan.slides.length; i++) {
      const nombre = `${dir}/media/${String(i).padStart(2, "0")}.jpg`;
      try {
        const blob = await (await contenido(nombre, sha)).blob();
        const url = URL.createObjectURL(blob); urlsBlob.push(url);
        const img = document.createElement("img"); img.src = url; img.alt = i === 1 ? plan.altText : `Slide ${i}`; img.loading = "lazy";
        carr.append(img);
      } catch (err) {
        if (err.status !== 404) throw err;
        faltan++;
        const v = document.createElement("div"); v.className = "vacio"; v.textContent = `Slide ${i}: generando imagen…`; carr.append(v);
      }
      const p = document.createElement("i"); if (i === 1) p.className = "on"; puntos.append(p);
    }
    carr.addEventListener("scroll", () => {
      const n = Math.round(carr.scrollLeft / carr.clientWidth);
      [...puntos.children].forEach((p, i) => p.classList.toggle("on", i === n));
    }, { passive: true });

    const aviso = $(".aviso", el);
    if (faltan) { aviso.hidden = false; aviso.textContent = "Las imágenes todavía se están generando. Recargá en un par de minutos para poder aprobar."; $(".b-aprobar", el).disabled = true; }
    if (pr.draft) { aviso.hidden = false; aviso.textContent = "El PR está en borrador."; $(".b-aprobar", el).disabled = true; }

    $(".b-aprobar", el).onclick = () => aprobar(pr, plan, el);
    $(".b-rechazar", el).onclick = () => rechazar(pr, el);
    $(".b-cambios", el).onclick = () => pedirCambios(pr, el);
  } catch (err) {
    if (err.status === 401) throw err;
    $(".tema", el).textContent = pr.title;
    const aviso = $(".aviso", el); aviso.hidden = false; aviso.textContent = `No pude cargar el post: ${err.message}`;
    $(".b-aprobar", el).disabled = true;
  }
  return el;
}

function bloquear(el, b) { el.querySelectorAll("button").forEach((x) => (x.disabled = b)); }
function resultado(el, texto) {
  bloquear(el, true);
  const aviso = $(".aviso", el); aviso.hidden = false; aviso.textContent = texto;
  setTimeout(() => cargar(), 1500);
}

async function aprobar(pr, plan, el) {
  if (!(await confirmar("¿Aprobar este post?", `Se hace Merge y queda en cola para publicarse el ${plan.date}.`, { ok: "Aprobar" }))) return;
  bloquear(el, true);
  try {
    // sha: solo mergea si el PR sigue siendo exactamente lo que estás viendo
    await api(`/repos/${cfg.repo}/pulls/${pr.number}/merge`, { metodo: "PUT", cuerpo: { sha: pr.head.sha, merge_method: "merge", commit_title: `${pr.title} (#${pr.number})` } });
    resultado(el, "✅ Aprobado. Queda en cola para publicarse.");
  } catch (err) {
    bloquear(el, false);
    alert(err.status === 409 ? "El post cambió mientras lo mirabas (por ejemplo, se regeneraron las imágenes). Recargá y revisalo de nuevo." :
          err.status === 405 ? `GitHub no deja hacer Merge todavía: ${err.message}` : `No se pudo aprobar: ${err.message}`);
    if (err.status === 409) cargar();
  }
}

async function rechazar(pr, el) {
  const motivo = await confirmar("¿Rechazar este post?", "Se cierra el PR y no se publica. Si querés, dejá el motivo (ayuda a Claude a no repetirlo).", { pedirTexto: true, ok: "Rechazar" });
  if (motivo === null) return;
  bloquear(el, true);
  try {
    if (motivo) await api(`/repos/${cfg.repo}/issues/${pr.number}/comments`, { metodo: "POST", cuerpo: { body: `❌ Rechazado desde la app: ${motivo}` } });
    await api(`/repos/${cfg.repo}/pulls/${pr.number}`, { metodo: "PATCH", cuerpo: { state: "closed" } });
    resultado(el, "Rechazado. No se publica.");
  } catch (err) { bloquear(el, false); alert(`No se pudo rechazar: ${err.message}`); }
}

async function pedirCambios(pr, el) {
  const txt = await confirmar("Pedir cambios", "Claude lo rehace en su próxima ejecución.", { pedirTexto: true, ok: "Enviar", obligatorio: true });
  if (!txt) return;
  bloquear(el, true);
  try {
    await api(`/repos/${cfg.repo}/issues/${pr.number}/comments`, { metodo: "POST", cuerpo: { body: `💬 Pedido de cambios desde la app: ${txt}` } });
    bloquear(el, false);
    const aviso = $(".aviso", el); aviso.hidden = false; aviso.textContent = "Pedido enviado. Claude lo va a corregir.";
  } catch (err) { bloquear(el, false); alert(`No se pudo enviar: ${err.message}`); }
}

async function cargarResueltos() {
  const cont = $("#resueltos"); cont.replaceChildren();
  try {
    const cerrados = (await api(`/repos/${cfg.repo}/pulls?state=closed&per_page=10&sort=updated&direction=desc`)).filter(esPost);
    if (!cerrados.length) { cont.textContent = "Todavía nada."; return; }
    for (const pr of cerrados) {
      const d = document.createElement("div"); d.className = "resuelto";
      const t = document.createElement("span"); t.textContent = pr.title.replace(/^Post /, "");
      const e = document.createElement("b"); e.textContent = pr.merged_at ? "✅ Aprobado" : "❌ Rechazado";
      d.append(t, e); cont.append(d);
    }
  } catch { cont.textContent = "No se pudo cargar."; }
}

function manejarError(err) {
  if (err.status === 401) { estado(""); borrarConfig(); cfg = null; mostrar("config"); $("#config-error").textContent = "El token venció o fue revocado. Pegá uno nuevo."; return; }
  estado(err instanceof TypeError ? "Sin conexión. Revisá internet y recargá." : `Error: ${err.message}`);
}

// ---------- modo demo (?demo=1): datos de prueba, no toca GitHub ----------
let demoEstado = "open";
function demoImagen(i, total) {
  const c = document.createElement("canvas"); c.width = 540; c.height = 675;
  const g = c.getContext("2d");
  g.fillStyle = ["#22170f", "#f5ecdc", "#c9962e", "#2e2016"][i % 4]; g.fillRect(0, 0, 540, 675);
  g.fillStyle = i % 4 === 1 || i % 4 === 2 ? "#22170f" : "#f5ecdc";
  g.font = "bold 44px Georgia"; g.fillText("DEMO", 40, 100); g.font = "28px Georgia"; g.fillText(`Slide ${i + 1} de ${total}`, 40, 150);
  return new Promise((r) => c.toBlob(r, "image/jpeg"));
}
async function demoApi(ruta, metodo, cuerpo, raw) {
  await new Promise((r) => setTimeout(r, 150));
  const pr = { number: 7, title: "Post 2026-11-21 · carousel · Platos con triple guarnición", draft: false, html_url: "#", head: { ref: "claude/post-2026-11-21", sha: "abc123" } };
  if (ruta.includes("/pulls?state=open")) return demoEstado === "open" ? [pr] : [];
  if (ruta.includes("/pulls?state=closed")) return demoEstado === "open" ? [] : [{ ...pr, merged_at: demoEstado === "merged" ? "2026-11-20" : null }];
  if (ruta.endsWith("/files?per_page=100")) return [{ filename: "posts/2026-11-21/plan.json" }, { filename: "posts/2026-11-21/caption.md" }];
  if (ruta.includes("plan.json")) return new Response(JSON.stringify({ date: "2026-11-21", format: "carousel", pillar: "platos", topic: "Platos con triple guarnición (DEMO)",
    slides: [{}, {}, {}, {}], hashtags: ["#PokerBuenosAires", "#BuenosAires", "#Gastronomia"], altText: "Imagen de demostración.", riskFlags: [], sources: [{ dato: "platos", fuente: "carta vigente" }] }));
  if (ruta.includes("caption.md")) return new Response("¿Arroz, papas fritas o ensalada? Acá no hace falta elegir. 🍽️\n\n(Texto de demostración)");
  const m = ruta.match(/media\/(\d+)\.jpg/);
  if (m) return new Response(await demoImagen(+m[1] - 1, 4));
  if (ruta.endsWith("/merge") && metodo === "PUT") { demoEstado = "merged"; return { merged: true }; }
  if (metodo === "PATCH") { demoEstado = "closed"; return {}; }
  if (metodo === "POST") return {};
  return {};
}

// ---------- arranque ----------
if ("serviceWorker" in navigator && !DEMO) navigator.serviceWorker.register("sw.js").catch(() => {});
if (cfg) cargar(); else mostrar("config");
