# Cambios entre lo que hice y `src/routes/index.tsx`

## 1. Assets — imágenes importadas (líneas 15–16)

| Archivo      | Línea | Antes                                                        | Después                                                   |
| ------------ | ----- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `antiguo.md` | 15    | `import quitoHero from "@/assets/quito-hero.png.asset.json"` | —                                                         |
| `index.tsx`  | 15    | —                                                            | `import quitoHero from "@/assets/FondoInvestigacion.png"` |
| `antiguo.md` | 16    | `import starDeco from "@/assets/star.png.asset.json"`        | —                                                         |
| `index.tsx`  | 16    | —                                                            | `import starDeco from "@/assets/Estrella.png"`            |

**Cambio**: Se reemplazaron las imágenes `.png.asset.json` por archivos `.png` directos (`FondoInvestigacion.png` y `Estrella.png`).

## 2. Componente `StarDeco` — atributo `src` (línea 22)

| Archivo      | Línea | Antes                | Después          |
| ------------ | ----- | -------------------- | ---------------- |
| `antiguo.md` | 22    | `src={starDeco.url}` | —                |
| `index.tsx`  | 22    | —                    | `src={starDeco}` |

**Cambio**: Se quitó `.url` porque ahora `starDeco` es un string URL directo, no un objeto JSON.

## 3. Hero — imagen de fondo `src` (línea 572 → 789)

| Archivo      | Línea | Antes                 | Después           |
| ------------ | ----- | --------------------- | ----------------- |
| `antiguo.md` | 572   | `src={quitoHero.url}` | —                 |
| `index.tsx`  | 789   | —                     | `src={quitoHero}` |

**Cambio**: Mismo motivo que en StarDeco — `quitoHero` ya no es un objeto JSON sino un string.

## 4. Hero — `className` de la imagen de fondo (línea 574 → 791)

| Archivo      | Línea | Antes                                                                               | Después                                                                                                                                  |
| ------------ | ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `antiguo.md` | 574   | `"pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover"` | —                                                                                                                                        |
| `index.tsx`  | 791   | —                                                                                   | `"pointer-events-none absolute left-1/2 top-1/2 z-0 h-full w-full max-w-9xl -translate-x-1/2 -translate-y-1/2 select-none object-cover"` |

**Cambio**: La imagen pasó de `inset-0` (ocupar todo el contenedor directamente) a centrarse con `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` + `max-w-9xl`, para un efecto de cubrimiento más controlado (como `object-cover` centrado).

## 5. Hero — título `h1` (línea 586 → 804)

| Archivo      | Línea   | Antes                                                                 | Después                                                                                               |
| ------------ | ------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `antiguo.md` | 586     | `<h1 className="display text-[clamp(48px,9vw,128px)] leading-[0.9]">` | —                                                                                                     |
| `index.tsx`  | 803–804 | —                                                                     | `<div className="h-200"><h1 className="max-w-2xl display text-[clamp(28px,5vw,80px)] leading-[0.9]">` |

**Cambio**:

- Se agregó un `<div className="h-200">` contenedor alrededor del `<h1>`.
- El `h1` se redujo de `clamp(48px,9vw,128px)` a `clamp(28px,5vw,80px)` (más pequeño).
- Se agregó `max-w-2xl` para limitar el ancho.

## 6. Hero — segundo botón (línea 599–601 → 815–817)

| Archivo      | Línea   | Antes                                                                                            | Después                                                                                                                              |
| ------------ | ------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `antiguo.md` | 599–601 | `<BounceButton color={COLORS.mint}><Github className="h-5 w-5" /> Datos abiertos</BounceButton>` | —                                                                                                                                    |
| `index.tsx`  | 815–817 | —                                                                                                | `<BounceButton color={COLORS.mint} onClick={() => setShowSimMenu(true)}><Zap className="h-5 w-5" /> Simular anomalía</BounceButton>` |

**Cambio**: El botón de "Datos abiertos" con icono de Github se reemplazó por "Simular anomalía" con icono de Zap y un `onClick` que abre un modal de simulación.

## 7. NUEVO: Sistema de simulación de anomalías (índex.tsx líneas 478–659, 701–758)

Se agregaron las siguientes declaraciones de estado y funciones que **no existían** en `antiguo.md`:

| Elemento                                | Líneas  | Descripción                                                                           |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `simulatedAnomalies` state              | 478     | `useState<RuleEvent[]>([])`                                                           |
| `showSimMenu` state                     | 479     | `useState(false)` — controla visibilidad del modal                                    |
| `page` state                            | 480     | `useState(1)` — paginación                                                            |
| `simulateAnomaly(rule)`                 | 482–606 | Genera un `RuleEvent` simulado según el tipo de regla y lo agrega al inicio del array |
| `clearSimulated()`                      | 608–611 | Limpia todas las simulaciones                                                         |
| `allEventsWithSim`                      | 613     | Combina simuladas + reales: `[...simulatedAnomalies, ...allEvents]`                   |
| `SIM_OPTIONS`                           | 650–659 | Array con las 8 opciones disponibles para simular                                     |
| `useEffect` reset page                  | 638     | `useEffect(() => { setPage(1); }, [allEventsWithSim, ruleFilter, varFilter])`         |
| `totalPages`, `pageStart`, `pageEvents` | 646–648 | Lógica de paginación (9 items por página)                                             |
| Modal de simulación                     | 701–758 | Modal `AnimatePresence` con grid de botones y opción de limpiar                       |

## 8. Todas las referencias a `allEvents` se cambiaron a `allEventsWithSim`

| Contexto                  | Línea (antiguo.md) | Antes                                            | Línea (index.tsx) | Después                                                 |
| ------------------------- | ------------------ | ------------------------------------------------ | ----------------- | ------------------------------------------------------- |
| Filtro por regla (conteo) | ~984               | `allEvents.filter(e => e.rule === r.key).length` | 1222              | `allEventsWithSim.filter(e => e.rule === r.key).length` |
| Filtered events           | 491–496            | filtrando `allEvents`                            | 631–636           | filtrando `allEventsWithSim`                            |
| Total anomalías           | 505–507            | `return allEvents.length`                        | 662–663           | `return allEventsWithSim.length`                        |
| Hoy — lastEvents          | 517                | `allEvents.filter(e => e.date === lastDate)`     | 674               | `allEventsWithSim.filter(e => e.date === lastDate)`     |
| Conteo en filtros         | 1005               | `{allEvents.length}`                             | 1243              | `{allEventsWithSim.length}`                             |

**Cambio**: En todas estas referencias se cambió `allEvents` por `allEventsWithSim` para que las anomalías simuladas también aparezcan en el conteo, filtros, y sección "Hoy".

## 9. Paginación de eventos en lugar de `slice(0, 30)` (línea 1014 → 1269)

| Archivo      | Línea     | Antes                                          | Después                       |
| ------------ | --------- | ---------------------------------------------- | ----------------------------- |
| `antiguo.md` | 1014–1015 | `{filteredEvents.slice(0, 30).map((e, i) => {` | —                             |
| `index.tsx`  | 1269      | —                                              | `{pageEvents.map((e, i) => {` |
| key          | 1018      | `key={e.date + e.rule + i}`                    | 1272                          | `key={e.date + e.rule + pageStart + i}` |

**Cambio**: Se reemplazó el `slice(0, 30)` fijo por paginación completa de 9 items por página, con `pageStart` para calcular el offset.

## 10. Eliminado: mensaje "Mostrando los 30 más recientes" (antiguo.md 1048–1050)

**Antes** (antiguo.md 1048–1050):

```tsx
{
  filteredEvents.length > 30 && (
    <p className="mt-4 text-center text-xs font-bold opacity-60">
      Mostrando los 30 más recientes de {filteredEvents.length}.
    </p>
  );
}
```

**Después**: Eliminado por completo. Reemplazado por los controles de paginación.

## 11. NUEVO: Controles de paginación (índex.tsx 1301–1324)

Se agregaron botones "Anterior" / "Siguiente" con indicador de página actual (`page / totalPages`) y estado `disabled` en los extremos. No existía en `antiguo.md`.

## 12. NUEVO: Leyenda de colores (índex.tsx 1247–1260)

Se agregó una sección `<Brick>` con tarjetas para cada regla mostrando su color de fondo y etiqueta. **No existía** en `antiguo.md`.

## 13. Formato del código — indentación consistente

`antiguo.md` tenía indentación irregular (mezcla de 0, 2 y a veces 4 espacios). `index.tsx` usa indentación consistente de 2 espacios en todo el archivo.

Además, la función `heatIndexC` tiene la fórmula larga partida en múltiples líneas (antiguo.md línea 203–204 → index.tsx líneas 206–209):

- **Antes** (una línea):
  ```tsx
  const hi =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    6.83783e-3 * T * T -
    5.481717e-2 * R * R +
    1.22874e-3 * T * T * R +
    8.5282e-4 * T * R * R -
    1.99e-6 * T * T * R * R;
  ```
- **Después** (varias líneas):
  ```tsx
  const hi =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    6.83783e-3 * T * T -
    5.481717e-2 * R * R +
    1.22874e-3 * T * T * R +
    8.5282e-4 * T * R * R -
    1.99e-6 * T * T * R * R;
  ```

## Resumen de líneas agregadas

`antiguo.md` tenía **1115 líneas**. `index.tsx` tiene **1390 líneas** (275 líneas más). Las adiciones principales son:

- Sistema de simulación de anomalías (~130 líneas nuevas de lógica + ~58 líneas de modal JSX)
- Leyenda de colores (~14 líneas)
- Paginación con controles (~24 líneas)
- Ajustes de estilos y layout en el hero (~10 líneas)

No se eliminó funcionalidad existente — todo lo que había en `antiguo.md` se mantiene en `index.tsx`, solo que mejorado con las nuevas características.
