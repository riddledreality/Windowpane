# Windowpane

Home Assistant frontend module that draws lightweight seasonal, weather, and holiday particle effects across your dashboards — like looking out a window.

**v0.1.0** — standalone (no GlowCast dependency).

## Effects

| Source | Effect |
|--------|--------|
| Weather (rain / pouring / lightning) | Rain (+ optional flash) |
| Weather (snow) | Heavy snow |
| Spring day / night | Petals / fireflies |
| Summer day / night | Sun sparkles / fireflies |
| Autumn | Tumbling leaves |
| Winter | Snowflakes |
| New Year's | Confetti (+ midnight fireworks) |
| Valentine's | Hearts |
| St. Patrick's | Shamrocks |
| Easter | Pastel eggs |
| Fourth of July | Fireworks (after sunset) |
| Halloween | Bats + fog |
| Thanksgiving | Leaves |
| Christmas | Twinkling snow |

## Modes

- **Auto** — follows weather (optional), then holidays, then season + day/night
- **Pick one** — lock any single effect year-round
- **Follow weather** — separate on/off (default on) so Auto can skip rain/snow from the weather entity

## Install

### Manual (test)

1. Copy `windowpane.js` to `/config/www/windowpane.js`
2. Add a Lovelace resource:

   ```yaml
   url: /local/windowpane.js
   type: module
   ```

3. Create helper `input_boolean.windowpane_pause` (optional, for automations / movie mode)
4. Add the settings card to a dashboard:

   ```yaml
   type: custom:windowpane-card
   ```

### HACS (when published)

1. HACS → ⋮ → **Custom repositories**
2. Add `https://github.com/riddledreality/Windowpane` as category **Dashboard**
3. Install **Windowpane**, refresh Lovelace

## Settings card options

| Key | Default | Notes |
|-----|---------|-------|
| `enabled` | `true` | Master on/off |
| `mode` | `auto` | `auto` or `pick` |
| `effect` | `snow` | Used when `mode: pick` |
| `follow_weather` | `true` | Auto only |
| `follow_seasons_holidays` | `true` | Auto only |
| `amount` | `low` | `low` / `medium` / `high` |
| `speed` | `5` | 1–10 |
| `layer` | `behind` | `behind` or `over` |
| `reduce_motion` | `true` | Respects OS setting |
| `dashboards` | `["window-pane"]` | Empty = all; else `url_path` list. Ships scoped to the test dashboard. |
| `weather_entity` | `weather.forecast_home` | |
| `pause_entity` | `input_boolean.windowpane_pause` | |

Settings are saved in the browser (`localStorage`) so the overlay keeps working after you leave the settings card.

## Performance

- One canvas, capped at 30 fps
- ~40 particles on phones, ~80 on desktop (scaled by amount)
- Pauses when the tab is hidden
- `pointer-events: none` — never blocks taps

## License

MIT
