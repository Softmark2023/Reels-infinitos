# Reels Infinitos

Reels verticales (1080×1920) hechos en HTML + CSS y grabados a MP4 cuadro por cuadro con la skill
**Reels Infinitos**. Cada reel vive en `<marca>/<AAAA-MM-DD-tema>/` con:

- `reel.html` — escenas y textos del reel
- `motor.js`, `base.css` — motor de la plantilla (no se editan por reel)
- `marca.css` — colores y fuentes de la marca
- `guion.md` — guion por escenas, fuente de cada dato y texto del post
- `<nombre>.mp4`, `<nombre>-portada.jpg`, `<nombre>-hoja.jpg` — video, portada y hoja de revisión

Para volver a grabar después de cambiar un texto:

```bash
node <skill reels-infinitos>/scripts/grabar.mjs filmmakers/2026-10-22-comercial-sin-audio
```

## Reels

| Marca | Reel | Duración | Audio |
|---|---|---|---|
| filmmakers.marketing | [2026-10-22-comercial-sin-audio](filmmakers/2026-10-22-comercial-sin-audio/) | 23.4 s | sin audio |
