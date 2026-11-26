---
name: verify
description: Verificar un cambio en asistente-regen (app del paciente) antes de abrir o actualizar un PR. Corre las pruebas y compara, pantalla por pantalla, la app con el cambio contra main (capturas píxel a píxel, Worker y sesión simulados). Usar siempre antes de decir que un cambio «no cambia nada visual» o que «funciona».
---

# Verificar un cambio en asistente-regen (app del paciente)

No digas que un cambio funciona ni que no cambia lo visual sin haber hecho estos pasos.
En el PR, pegá la tabla del paso 2.

## 1. Pruebas y lint

```
npm run check
```

Tiene que terminar sin errores. Si falla una prueba que no tocaste, primero confirmá
que también falla en `main`; si en `main` pasa, el que la rompió es tu cambio.

## 2. Comparación visual contra main

```
git fetch origin main
python3 .claude/skills/verify/verify.py
```

El script:
1. compila la app tal como está y como está en `origin/main`;
2. abre las pantallas de `verify.json` (login, entrevista, «Mi ficha» con sus pestañas y planes) en celular (390 px) y escritorio (1280 px), con el Worker y la sesión simulados, la red externa cortada y el reloj fijo;
3. saca capturas y las compara.

Termina con una tabla:

- `idéntica`: no cambió nada en esa pantalla.
- `difiere en x…, y…: máx N/255, M píxeles visibles`: mirá la imagen `diff-*.png` en la carpeta que indica y la captura de `cambio/`. Diferencias de 1 o 2/255 en pocos píxeles son suavizado de bordes; cualquier otra cosa hay que explicarla.
- `cambió el alto`: se agregó o se sacó contenido.
- `⚠ no apareció la pantalla esperada` o `⚠ errores`: la pantalla no cargó bien. Revisá si tu cambio pide un endpoint nuevo que falta en `fixtures` de `verify.json`.

Opciones: `--base <rama o commit>` para comparar contra otra cosa, `--solo` para sacar solo las capturas del cambio (útil cuando el cambio es visual a propósito: mostralas en el PR), y `--out <carpeta>` para elegir dónde quedan.

## 3. Mirar la pantalla que tocaste

Abrí al menos una captura de `cambio/` de la pantalla que tocaste y miralo vos (con la
herramienta para leer imágenes). Que el script diga «idéntica» no reemplaza mirar una
pantalla nueva.

## Si tocás datos o pantallas nuevas

- Pantalla nueva: sumala a `screens` en `verify.json` (con su `path`, el selector `ready` que confirma que cargó y, si hace falta, los `click` para llegar).
- Endpoint nuevo: sumá su respuesta a `fixtures`, con la forma real que devuelve el Worker (mirala en `regen-worker/src`). Datos inventados, nunca reales.
- Después de editar `verify.json`, corré `--base HEAD` una vez: todo tiene que dar `idéntica` (confirma que la verificación es estable).

## Límites

- Lo que se dibuja solo en un `<canvas>` (la esfera de la entrevista) se oculta en las capturas: se cuida con las pruebas.
- Las animaciones corren con «reducir movimiento» para que las capturas sean estables.
- No reemplaza probar en un celular real: login real con Google, micrófono, pagos.
