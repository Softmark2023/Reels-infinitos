/* Reels Infinitos · motor.js — línea de tiempo determinista para reels hechos en HTML.
 * Se copia tal cual a cada reel; lo que cambia de un reel a otro va en reel.html.
 *
 *   window.seek(t)    deja el reel exactamente en el segundo t (lo usa grabar.mjs)
 *   window.DURACION   duración total = suma de data-dura de las escenas
 *   window.listo      true cuando fuentes, imágenes y videos ya cargaron
 *   window.Reel       utilidades para efectos propios (Reel.cada(fn), Reel.tramo, Reel.azar…)
 *
 * Abrir reel.html directo = vista previa en bucle (espacio pausa, ← → mueve, G guías, H panel).
 *   ?t=4.2       congela en ese segundo
 *   ?guias=1     muestra las zonas que tapa Instagram
 *   ?captura=1   modo grabación: tamaño real, sin bucle ni panel
 */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const CAPTURA = q.has('captura');
  const FIJO = q.has('t') ? parseFloat(q.get('t')) || 0 : null;
  const reel = document.getElementById('reel');
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
  const num = (el, clave, def) => { const v = parseFloat(el?.dataset?.[clave]); return Number.isFinite(v) ? v : def; };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const CURVAS = {
    lineal: p => p,
    suave: p => 1 - (1 - p) ** 3,
    entra: p => p ** 3,
    media: p => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
    rebote: p => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2,
  };
  const tramo = (t, ini, dura, curva = 'suave') => (CURVAS[curva] || CURVAS.suave)(clamp((t - ini) / Math.max(dura, 1e-6)));
  const espera = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Escenas: una tras otra según data-dura ----------
  const escenas = $$('.escena');
  let fin = 0;
  escenas.forEach((e, i) => {
    const dura = num(e, 'dura', 3);
    const ini = num(e, 'desde', fin);
    const ultima = i === escenas.length - 1;
    e._ini = ini;
    e._dura = dura;
    e.style.setProperty('--in', ini + 's');
    e.style.setProperty('--dura', dura + 's');
    e.style.setProperty('--out', (ultima && !e.hasAttribute('data-sale') ? 9999 : ini + dura - 0.35) + 's');
    fin = Math.max(fin, ini + dura);
  });
  const DURACION = num(reel, 'duracion', fin || 10);
  window.DURACION = DURACION;
  const inicioDe = el => el.closest('.escena')?._ini ?? 0;

  // data-t también sirve como --t (retraso de la entrada CSS) y data-s como --s (salida anticipada), relativos a la escena
  $$('[data-t]').forEach(el => { if (!el.style.getPropertyValue('--t')) el.style.setProperty('--t', num(el, 't', 0) + 's'); });
  $$('[data-s]').forEach(el => { if (!el.style.getPropertyValue('--s')) el.style.setProperty('--s', num(el, 's', 0) + 's'); });

  // ---------- data-palabras: el texto entra palabra por palabra ----------
  $$('[data-palabras]').forEach(cont => {
    const paso = parseFloat(cont.dataset.palabras) || 0.12;
    let t = num(cont, 't', 0);
    const marca = el => el.style.setProperty('--t', t.toFixed(3) + 's');
    const partir = nodo => [...nodo.childNodes].forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(trozo => {
          if (!trozo) return;
          if (/^\s+$/.test(trozo)) { frag.append(trozo); return; }
          const s = document.createElement('span');
          s.className = 'w';
          s.textContent = trozo;
          marca(s);
          t += paso;
          frag.append(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'BR') {
        // un data-t dentro del texto reinicia el reloj de palabras (para empatar con la voz)
        if (n.hasAttribute('data-t')) t = num(n, 't', t); else marca(n);
        if (n.hasAttribute('data-junta')) { n.classList.add('w'); t += paso; } else partir(n);
      }
    });
    partir(cont);
  });

  // ---------- data-escribir: letra por letra (código, búsquedas, chats) ----------
  const escrituras = $$('[data-escribir]').map(cont => {
    const letras = [];
    const partir = nodo => [...nodo.childNodes].forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const c of n.textContent) {
          const s = document.createElement('span');
          s.textContent = c;
          letras.push(s);
          frag.append(s);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === Node.ELEMENT_NODE) partir(n);
    });
    partir(cont);
    const cursor = cont.hasAttribute('data-cursor') ? Object.assign(document.createElement('span'), { className: 'cursor' }) : null;
    return { cont, letras, cursor, ini: inicioDe(cont) + num(cont, 't', 0), dura: parseFloat(cont.dataset.escribir) || 1.5, n: -1 };
  });
  function escribir(t) {
    escrituras.forEach(x => {
      const n = Math.floor(clamp((t - x.ini) / x.dura) * x.letras.length);
      if (n === x.n) return;
      x.letras.forEach((s, i) => { s.style.visibility = i < n ? '' : 'hidden'; });
      if (x.cursor) { const ref = x.letras[n - 1]; if (ref) ref.after(x.cursor); else x.cont.prepend(x.cursor); }
      x.n = n;
    });
  }

  // ---------- data-contar: cifras que suben ----------
  const formato = (v, dec) => v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const contadores = $$('[data-contar]').map(el => ({
    el, ini: inicioDe(el) + num(el, 't', 0), dura: num(el, 'dura', 1.6),
    de: num(el, 'inicio', 0), a: parseFloat(el.dataset.contar), dec: num(el, 'decimales', 0),
    pre: el.dataset.prefijo || '', suf: el.dataset.sufijo || '', curva: el.dataset.curva || 'suave', txt: '',
  }));
  function contar(t) {
    contadores.forEach(c => {
      const s = c.pre + formato(c.de + (c.a - c.de) * tramo(t, c.ini, c.dura, c.curva), c.dec) + c.suf;
      if (s !== c.txt) c.el.textContent = c.txt = s;
    });
  }

  // ---------- data-trazar: líneas SVG que se dibujan (gráficas, dibujos de fondo) ----------
  const trazos = $$('[data-trazar]').map(p => {
    p.removeAttribute('pathLength');
    const largo = p.getTotalLength();
    p.style.strokeDasharray = `${largo} ${largo}`;
    return {
      p, largo, ini: inicioDe(p) + num(p, 't', 0), dura: num(p, 'dura', 1.5), curva: p.dataset.curva || 'suave',
      punto: p.dataset.punto ? document.querySelector(p.dataset.punto) : null,
      area: p.dataset.area ? document.querySelector(p.dataset.area) : null,
    };
  });
  function trazar(t) {
    trazos.forEach(x => {
      const k = tramo(t, x.ini, x.dura, x.curva);
      x.p.style.strokeDashoffset = x.largo * (1 - k);
      if (x.area) x.area.style.opacity = k;
      if (x.punto) {
        const pt = x.p.getPointAtLength(k * x.largo);
        x.punto.setAttribute('cx', pt.x);
        x.punto.setAttribute('cy', pt.y);
        x.punto.style.opacity = k > 0.01 ? 1 : 0;
      }
    });
  }

  // ---------- <video>: sincronizado con la escena (data-t, data-recorte, data-velocidad, data-bucle) ----------
  const videos = $$('video', reel).map(v => {
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = false;
    v.removeAttribute('autoplay'); v.pause();
    const x = { v, ini: inicioDe(v) + num(v, 't', 0), desde: num(v, 'recorte', 0), vel: num(v, 'velocidad', 1), bucle: v.hasAttribute('data-bucle') };
    v.playbackRate = x.vel;
    return x;
  });
  const objetivo = (x, t) => {
    const d = x.v.duration || 0;
    let s = x.desde + Math.max(0, t - x.ini) * x.vel;
    if (x.bucle && d > x.desde) s = x.desde + ((s - x.desde) % (d - x.desde));
    return d ? Math.min(s, d - 0.04) : s;
  };
  async function videosCaptura(t) {
    await Promise.all(videos.map(async x => {
      const s = objetivo(x, t);
      if (Math.abs(x.v.currentTime - s) < 0.001 && x.v.readyState >= 2) return;
      await Promise.race([new Promise(r => { x.v.addEventListener('seeked', r, { once: true }); x.v.currentTime = s; }), espera(3000)]);
      if (x.v.requestVideoFrameCallback) await Promise.race([new Promise(r => x.v.requestVideoFrameCallback(() => r())), espera(120)]);
    }));
  }
  function videosVista(t, sonando) {
    videos.forEach(x => {
      const s = objetivo(x, t);
      const activo = t >= x.ini && (!x.v.duration || x.bucle || s < x.v.duration - 0.05);
      if (Math.abs(x.v.currentTime - s) > 0.3) x.v.currentTime = s;
      if (activo && sonando && x.v.paused) x.v.play().catch(() => {});
      if ((!activo || !sonando) && !x.v.paused) x.v.pause();
    });
  }

  // ---------- Subtítulos de la voz en off (window.SUBTITULOS de subtitulos.js) ----------
  const caja = document.getElementById('subtitulos');
  let bloques = [];
  if (caja && window.SUBTITULOS) {
    const lista = (window.SUBTITULOS.palabras || window.SUBTITULOS).filter(w => w.p && w.p.trim());
    const max = num(caja, 'palabras', 4);
    const limpiar = caja.hasAttribute('data-con-puntos') ? s => s : s => s.replace(/[.,;:]+$/, '');
    let actual = [];
    lista.forEach((w, i) => {
      const prev = lista[i - 1];
      const corta = prev && (actual.length >= max || w.i - prev.f > 0.45 || /[.?!…]$/.test(prev.p) || (/[,;:]$/.test(prev.p) && actual.length >= 2));
      if (corta && actual.length) { bloques.push(actual); actual = []; }
      actual.push(w);
    });
    if (actual.length) bloques.push(actual);
    bloques = bloques.map(ws => {
      const el = document.createElement('div');
      el.className = 'bloque';
      ws.forEach((w, j) => {
        const s = document.createElement('span');
        s.className = 'sp';
        s.textContent = limpiar(w.p);
        el.append(s);
        if (j < ws.length - 1) el.append(' ');
        w.el = s;
      });
      caja.append(el);
      return { el, ws, i: ws[0].i, f: ws[ws.length - 1].f };
    });
    bloques.forEach((b, k) => { const sig = bloques[k + 1]; b.hasta = sig ? Math.min(sig.i - 0.05, b.f + 0.7) : b.f + 0.9; });
  }
  // escenas que ya muestran en grande lo que dice la voz: ahí no van subtítulos
  // (ni los renglones que empiezan en ellas, aunque terminen en la escena siguiente)
  const sinSubs = escenas.filter(e => e.hasAttribute('data-sin-subs')).map(e => [e._ini, e._ini + e._dura]);
  const enSinSubs = t => sinSubs.some(([a, b]) => t >= a && t < b);
  bloques.forEach(b => { b.apagado = enSinSubs(b.i); });
  function subtitular(t) {
    const apagados = enSinSubs(t);
    bloques.forEach(b => {
      const ver = !apagados && !b.apagado && t >= b.i - 0.05 && t < b.hasta;
      b.el.classList.toggle('ver', ver);
      if (!ver) return;
      b.el.style.transform = `scale(${(0.9 + 0.1 * tramo(t, b.i - 0.05, 0.16, 'rebote')).toFixed(4)})`;
      b.ws.forEach((w, j) => {
        const sig = b.ws[j + 1];
        w.el.classList.toggle('dicha', t >= w.i);
        w.el.classList.toggle('activa', t >= w.i && t < (sig ? sig.i : b.hasta));
      });
    });
  }

  // ---------- Barra de avance y efectos propios ----------
  const progresos = $$('[data-progreso]');
  const extras = [];
  window.Reel = {
    cada: fn => extras.push(fn),
    tramo, clamp, curvas: CURVAS, inicioDe, duracion: DURACION,
    azar: semilla => () => { // números "al azar" pero iguales en cada cuadro y en cada grabación
      semilla = (semilla + 0x6d2b79f5) | 0;
      let r = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    },
  };

  function dibujar(t) {
    document.getAnimations().forEach(a => { a.pause(); a.currentTime = t * 1000; });
    escribir(t); contar(t); trazar(t); subtitular(t);
    progresos.forEach(b => { b.style.transform = `scaleX(${(t / DURACION).toFixed(4)})`; });
    extras.forEach(fn => fn(t));
  }
  window.seek = async t => {
    dibujar(t);
    if (CAPTURA) await videosCaptura(t);
  };

  // ---------- Guías de zonas seguras ----------
  function guias() {
    const g = reel.querySelector('.guias');
    if (g) { g.remove(); return; }
    reel.insertAdjacentHTML('beforeend', `<div class="guias">
      <div style="top:0;left:0;right:0;height:250px">barra de la app</div>
      <div style="bottom:0;left:0;right:0;height:420px">nombre y descripción</div>
      <div style="right:0;width:150px;top:880px;bottom:420px">botones</div>
      <div class="pauta" style="top:1248px;left:0;right:0">límite para pauta (35 % inferior)</div></div>`);
  }

  // ---------- Vista previa en el navegador ----------
  function vistaPrevia() {
    document.documentElement.classList.add('vista');
    const ajustar = () => reel.style.setProperty('--escala', (Math.min(innerWidth / 1080, innerHeight / 1920) * 0.98).toFixed(4));
    ajustar();
    addEventListener('resize', ajustar);
    const hud = Object.assign(document.createElement('div'), { className: 'hud' });
    document.body.append(hud);
    const voz = document.getElementById('voz');
    const musica = document.getElementById('musica');
    if (musica) musica.volume = clamp(num(musica, 'volumen', 0.15));
    const pistas = [voz, musica].filter(Boolean);
    let t = FIJO ?? 0, sonando = FIJO === null, audioListo = false, ultimo = performance.now();
    const moverAudio = () => pistas.forEach(a => {
      a.currentTime = Math.min(t, a.duration || t);
      if (sonando && audioListo && t < (a.duration || Infinity)) a.play().catch(() => {}); else a.pause();
    });
    const alternar = () => {
      if (sonando && pistas.length && !audioListo) { audioListo = true; t = 0; moverAudio(); return; } // primer clic: arranca con sonido
      sonando = !sonando;
      audioListo = true;
      moverAudio();
    };
    addEventListener('click', alternar);
    addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); alternar(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { t = clamp(t + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 1), 0, DURACION); moverAudio(); }
      else if (e.key === 'Home') { t = 0; moverAudio(); }
      else if (e.key.toLowerCase() === 'g') guias();
      else if (e.key.toLowerCase() === 'h') hud.hidden = !hud.hidden;
    });
    (function cuadro(ahora) {
      if (sonando) {
        t += (ahora - ultimo) / 1000;
        if (voz && !voz.paused && !voz.ended) t = voz.currentTime;
        if (t >= DURACION) { t = 0; moverAudio(); }
      }
      ultimo = ahora;
      dibujar(t);
      videosVista(t, sonando);
      const n = escenas.findIndex(x => t >= x._ini && t < x._ini + x._dura) + 1;
      hud.textContent = `${t.toFixed(2)} s / ${DURACION.toFixed(1)} s · escena ${n}/${escenas.length} · ${sonando ? '▶' : '❚❚'}` +
        `${pistas.length && !audioListo ? ' · clic para oír la voz' : ''} · espacio, ← →, G guías`;
      requestAnimationFrame(cuadro);
    })(performance.now());
  }

  // ---------- Textos que no caben: se achican hasta caber (cada marca tiene fuentes de distinto ancho) ----------
  // Se mide sin animaciones (estado final) y del más interno al más externo: un texto no cabe si se sale
  // del margen del cuadro (50 px por lado) o desborda su propia caja.
  function ajustarTextos() {
    document.documentElement.classList.add('midiendo');
    const marco = reel.getBoundingClientRect();
    const noCabe = el => {
      const b = el.getBoundingClientRect();
      const desborda = getComputedStyle(el).display !== 'inline' && el.scrollWidth > el.clientWidth + 1;
      return b.left < marco.left + 50 || b.right > marco.right - 50 || desborda;
    };
    $$('[data-ajustar], .titulo, .gigante, .impacto, .cifra, .cifras strong', reel).reverse().forEach(el => {
      let tam = parseFloat(getComputedStyle(el).fontSize);
      for (let i = 0; i < 25 && noCabe(el); i++) {
        tam *= 0.95;
        el.style.fontSize = tam.toFixed(1) + 'px';
      }
    });
    document.documentElement.classList.remove('midiendo');
  }

  // ---------- Carga: fuentes, imágenes y videos antes de avisar "listo" ----------
  async function cargar() {
    const css = getComputedStyle(document.documentElement);
    const familias = ['--fuente-titulo', '--fuente-texto', '--fuente-impacto', '--fuente-mono'].map(v => css.getPropertyValue(v).trim()).filter(Boolean);
    // cada espera tiene tope: algunos navegadores dejan colgado img.decode() o una fuente que no existe
    const conTope = (promesa, ms) => Promise.race([Promise.resolve(promesa).catch(() => {}), espera(ms)]);
    await conTope(Promise.all(familias.flatMap(f => ['400', '600', '700', '800', '900'].map(w => document.fonts.load(`${w} 48px ${f}`)))), 10000);
    await conTope(document.fonts.ready, 10000);
    await Promise.all($$('img').map(img => conTope(img.complete ? img.decode?.() : new Promise(r => { img.onload = img.onerror = r; }), 4000)));
    await Promise.all(videos.map(x => (x.v.readyState >= 2 ? null : Promise.race([
      new Promise(r => { x.v.addEventListener('loadeddata', r, { once: true }); x.v.addEventListener('error', r, { once: true }); x.v.load(); }),
      espera(15000),
    ]))));
  }

  cargar().then(async () => {
    ajustarTextos();
    await window.seek(FIJO ?? 0);
    if (q.has('guias')) guias();
    window.listo = true;
    if (!CAPTURA) vistaPrevia();
  });
})();
