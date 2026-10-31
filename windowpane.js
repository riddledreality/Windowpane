/**
 * Windowpane — seasonal / weather / holiday particle overlays for Home Assistant dashboards.
 * HACS frontend module + settings card. Branding is centralized in BRAND for easy rename.
 */
(function () {
  "use strict";

  /* ─── Branding (single rename point) ─── */
  const BRAND = {
    id: "windowpane",
    name: "Windowpane",
    cardType: "custom:windowpane-card",
    element: "windowpane-card",
    storageKey: "windowpane.config.v1",
    pauseEntity: "input_boolean.windowpane_pause",
    weatherEntity: "weather.forecast_home",
    seasonEntity: "sensor.season",
    sunEntity: "sun.sun",
    version: "0.1.2",
  };

  const AMOUNTS = { low: 0.45, medium: 0.75, high: 1.0 };
  const MOBILE_CAP = 40;
  const DESKTOP_CAP = 80;
  const MAX_FPS = 30;
  const FRAME_MS = 1000 / MAX_FPS;

  const EFFECTS = [
    { id: "snow", label: "Snow" },
    { id: "rain", label: "Rain" },
    { id: "leaves", label: "Leaves" },
    { id: "petals", label: "Petals" },
    { id: "fireflies", label: "Fireflies" },
    { id: "sparkles", label: "Sun sparkles" },
    { id: "seeds", label: "Dandelion seeds" },
    { id: "hearts", label: "Hearts" },
    { id: "shamrocks", label: "Shamrocks" },
    { id: "eggs", label: "Eggs" },
    { id: "bats", label: "Bats" },
    { id: "fog", label: "Fog" },
    { id: "confetti", label: "Confetti" },
    { id: "fireworks", label: "Fireworks" },
    { id: "twinkle_snow", label: "Christmas snow" },
  ];

  const DEFAULT_CONFIG = {
    enabled: true,
    mode: "auto", // auto | pick
    effect: "snow",
    follow_weather: true,
    follow_seasons_holidays: true,
    amount: "medium",
    speed: 5,
    layer: "over", // behind | over — over is default so canvas is visible above HA chrome
    reduce_motion: true,
    dashboards: ["window-pane"], // empty = all; else list of url_path (default: test dashboard only)
    weather_entity: BRAND.weatherEntity,
    season_entity: BRAND.seasonEntity,
    sun_entity: BRAND.sunEntity,
    pause_entity: BRAND.pauseEntity,
  };

  /* ─── Holiday calendar (standalone; no GlowCast dependency) ─── */
  function easterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const el = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * el) / 451);
    const month = Math.floor((h + el - 7 * m + 114) / 31);
    const day = ((h + el - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function usThanksgiving(year) {
    const first = new Date(year, 10, 1);
    const offset = (4 - first.getDay() + 7) % 7; // Thursday=4
    return new Date(year, 10, 1 + offset + 21);
  }

  function inRange(d, start, end) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return t >= start.getTime() && t <= end.getTime();
  }

  function currentHoliday(now = new Date()) {
    const y = now.getFullYear();
    const md = (m, day) => new Date(y, m - 1, day);

    // New Year's: Dec 31 – Jan 1
    if (
      (now.getMonth() === 11 && now.getDate() === 31) ||
      (now.getMonth() === 0 && now.getDate() === 1)
    ) {
      return { id: "new_years", effect: "confetti", midnightFireworks: true };
    }
    if (inRange(now, md(2, 7), md(2, 14)))
      return { id: "valentines", effect: "hearts" };
    if (inRange(now, md(3, 10), md(3, 17)))
      return { id: "st_patricks", effect: "shamrocks" };

    const easter = easterDate(y);
    const easterStart = new Date(easter);
    easterStart.setDate(easter.getDate() - 7);
    if (inRange(now, easterStart, easter))
      return { id: "easter", effect: "eggs" };

    if (inRange(now, md(6, 28), md(7, 5)))
      return { id: "fourth_of_july", effect: "fireworks", nightOnly: true };

    if (now.getMonth() === 9)
      return { id: "halloween", effect: "bats", fog: true };

    const thanks = usThanksgiving(y);
    const weekStart = new Date(thanks);
    weekStart.setDate(thanks.getDate() - thanks.getDay()); // Sunday
    // Monday of that week:
    const mon = new Date(thanks);
    mon.setDate(thanks.getDate() - ((thanks.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    if (inRange(now, mon, sun)) return { id: "thanksgiving", effect: "leaves" };

    const xmasStart = new Date(thanks);
    xmasStart.setDate(thanks.getDate() + 1);
    if (inRange(now, xmasStart, md(12, 30)))
      return { id: "christmas", effect: "twinkle_snow" };

    return null;
  }

  function seasonFromDate(now = new Date()) {
    const m = now.getMonth() + 1;
    const d = now.getDate();
    // Meteorological: Spring Mar1, Summer Jun1, Fall Sep1, Winter Dec1
    if ((m === 12 && d >= 1) || m === 1 || m === 2) return "winter";
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 6 && m <= 8) return "summer";
    return "autumn";
  }

  function mapSeasonName(raw) {
    if (!raw) return null;
    const s = String(raw).toLowerCase();
    if (s.includes("winter")) return "winter";
    if (s.includes("spring")) return "spring";
    if (s.includes("summer")) return "summer";
    if (s.includes("autumn") || s.includes("fall")) return "autumn";
    return null;
  }

  function isNight(sunState, hass) {
    if (sunState === "below_horizon") return true;
    if (sunState === "above_horizon") return false;
    const h = (hass && hass.states && hass.states[BRAND.sunEntity]) || null;
    if (h) return h.state === "below_horizon";
    const hour = new Date().getHours();
    return hour < 6 || hour >= 20;
  }

  function weatherEffect(condition) {
    if (!condition) return null;
    const c = String(condition).toLowerCase();
    if (c.includes("snow") || c === "hail") return { effect: "snow", heavy: true };
    if (
      c.includes("pouring") ||
      c.includes("rain") ||
      c === "lightning-rainy" ||
      c === "lightning"
    ) {
      return {
        effect: "rain",
        flash: c.includes("lightning"),
        heavy: c.includes("pouring"),
      };
    }
    return null;
  }

  function resolveEffect(cfg, hass) {
    if (cfg.mode === "pick") {
      return { effect: cfg.effect || "snow", reason: "pick" };
    }

    // Auto
    const weatherEnt =
      (hass && hass.states && hass.states[cfg.weather_entity]) || null;
    if (cfg.follow_weather !== false && weatherEnt) {
      const we = weatherEffect(weatherEnt.state);
      if (we) return { ...we, reason: "weather:" + weatherEnt.state };
    }

    if (cfg.follow_seasons_holidays !== false) {
      const hol = currentHoliday();
      if (hol) {
        const night = isNight(
          hass && hass.states && hass.states[cfg.sun_entity]
            ? hass.states[cfg.sun_entity].state
            : null,
          hass
        );
        if (hol.nightOnly && !night) {
          // fall through to season
        } else {
          return {
            effect: hol.effect,
            fog: !!hol.fog,
            midnightFireworks: !!hol.midnightFireworks,
            reason: "holiday:" + hol.id,
          };
        }
      }

      const seasonState =
        hass && hass.states && hass.states[cfg.season_entity]
          ? hass.states[cfg.season_entity].state
          : null;
      const season = mapSeasonName(seasonState) || seasonFromDate();
      const night = isNight(
        hass && hass.states && hass.states[cfg.sun_entity]
          ? hass.states[cfg.sun_entity].state
          : null,
        hass
      );

      if (season === "winter")
        return { effect: "snow", reason: "season:winter" };
      if (season === "autumn")
        return {
          effect: "leaves",
          slow: night,
          reason: "season:autumn" + (night ? ":night" : ""),
        };
      if (season === "spring")
        return {
          effect: night ? "fireflies" : "petals",
          reason: "season:spring" + (night ? ":night" : ""),
        };
      if (season === "summer")
        return {
          effect: night ? "fireflies" : "sparkles",
          reason: "season:summer" + (night ? ":night" : ""),
        };
    }

    return { effect: "snow", reason: "fallback" };
  }

  /* ─── Config persistence ─── */
  function loadConfig() {
    try {
      const raw = localStorage.getItem(BRAND.storageKey);
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  function saveConfig(cfg) {
    localStorage.setItem(BRAND.storageKey, JSON.stringify(cfg));
    window.dispatchEvent(
      new CustomEvent("windowpane-config", { detail: cfg })
    );
  }

  /* ─── Particle engine ─── */
  class Engine {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.particles = [];
      this.bursts = [];
      this.flash = 0;
      this.fog = 0;
      this.running = false;
      this.last = 0;
      this.raf = 0;
      this.effect = "snow";
      this.meta = {};
      this.cfg = loadConfig();
      this.hass = null;
      this.hidden = document.hidden;
      this._onVis = () => {
        // iOS / some WebViews report hidden oddly; only stop when clearly hidden.
        this.hidden = document.visibilityState === "hidden";
        if (!this.hidden) this.start();
        else this.stop();
      };
      document.addEventListener("visibilitychange", this._onVis);
      this.hidden = document.visibilityState === "hidden";
      window.addEventListener("windowpane-config", (e) => {
        this.cfg = e.detail;
        this.applyConfig();
      });
      window.addEventListener("resize", () => this.resize());
      // HA is an SPA — re-check dashboard path + remount after navigations.
      this._onLoc = () => {
        clearTimeout(this._locTimer);
        this._locTimer = setTimeout(() => this.applyConfig(), 50);
      };
      window.addEventListener("location-changed", this._onLoc);
      window.addEventListener("popstate", this._onLoc);
      // Also poll path lightly (Companion sometimes skips events)
      this._path = location.pathname;
      this._pathTimer = setInterval(() => {
        if (location.pathname !== this._path) {
          this._path = location.pathname;
          this.applyConfig();
        }
      }, 1000);
    }

    attach() {
      const c = this.canvas || document.createElement("canvas");
      c.id = BRAND.id + "-canvas";
      c.setAttribute("aria-hidden", "true");
      const over = this.cfg.layer !== "behind";
      Object.assign(c.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        // HA chrome (home-assistant) paints opaque over body z-index 0.
        // "over" sits above UI chrome but never captures taps.
        // "behind" tries to live inside the lovelace view under cards.
        zIndex: over ? "7" : "0",
      });
      const host = this._findMount(over);
      if (c.parentElement !== host) host.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext("2d", { alpha: true });
      this.resize();
    }

    _findMount(over) {
      // Prefer document.body for "over" so we cover the whole viewport above panels.
      if (over) return document.body;
      // behind: try to mount inside hui-view / hui-root so cards stack above us
      try {
        const ha = document.querySelector("home-assistant");
        const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector("home-assistant-main");
        const drawer = main && main.shadowRoot && (main.shadowRoot.querySelector("ha-drawer") || main.shadowRoot);
        const panel = drawer && drawer.querySelector && (drawer.querySelector("ha-panel-lovelace") || (drawer.shadowRoot && drawer.shadowRoot.querySelector("ha-panel-lovelace")));
        // ha-drawer children aren't in shadow; panel resolver is light DOM
        const resolver = main && main.shadowRoot && main.shadowRoot.querySelector("partial-panel-resolver");
        const lovelace = (resolver && resolver.querySelector("ha-panel-lovelace")) || document.querySelector("ha-panel-lovelace");
        const root = lovelace && lovelace.shadowRoot && lovelace.shadowRoot.querySelector("hui-root");
        const view =
          (root && root.shadowRoot && (root.shadowRoot.querySelector("#view") || root.shadowRoot.querySelector("hui-view"))) ||
          null;
        if (view) {
          if (getComputedStyle(view).position === "static") view.style.position = "relative";
          return view;
        }
        if (root && root.shadowRoot) return root.shadowRoot;
      } catch (_) {}
      return document.body;
    }

    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(window.innerWidth * dpr);
      this.canvas.height = Math.floor(window.innerHeight * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
    }

    cap() {
      const mobile =
        window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
      let cap = mobile ? MOBILE_CAP : DESKTOP_CAP;
      const amt = AMOUNTS[this.cfg.amount] || AMOUNTS.low;
      cap = Math.round(cap * amt);
      if (
        this.cfg.reduce_motion !== false &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        // Keep it clearly visible — just sparser/slower, not invisible.
        cap = Math.max(18, Math.round(cap * 0.55));
        this._reduced = true;
      } else {
        this._reduced = false;
      }
      return cap;
    }

    speedMul() {
      const s = Number(this.cfg.speed) || 5;
      let m = 0.4 + (s / 10) * 1.4;
      if (this._reduced) m *= 0.45;
      return m;
    }

    shouldRunOnDashboard() {
      const list = this.cfg.dashboards;
      if (!list || !list.length) return true;
      // HA storage dashboards use /{url_path} or /{url_path}/{view}
      // Companion may also use /lovelace/{url_path}/...
      const path = (location.pathname || "").replace(/\/$/, "").toLowerCase();
      const segments = path.split("/").filter(Boolean);
      return list.some((p) => {
        const needle = String(p).replace(/^\//, "").toLowerCase();
        if (!needle) return true;
        if (segments.includes(needle)) return true;
        // also allow prefix match: /window-pane/home
        if (path === "/" + needle || path.startsWith("/" + needle + "/")) return true;
        if (path.includes("/lovelace/" + needle)) return true;
        return false;
      });
    }

    isPaused() {
      if (this.cfg.enabled === false) return true;
      if (!this.shouldRunOnDashboard()) return true;
      const ent =
        this.hass &&
        this.hass.states &&
        this.hass.states[this.cfg.pause_entity || BRAND.pauseEntity];
      if (ent && String(ent.state).toLowerCase() === "on") return true;
      return false;
    }

    applyConfig() {
      if (!this.canvas) this.attach();
      if (this.canvas) {
        this.canvas.style.zIndex = this.cfg.layer === "behind" ? "0" : "7";
        this.attach(); // remount if layer/host changed
      }
      this.rebuild();
      if (this.isPaused() || this.hidden) this.stop();
      else this.start();
    }

    setHass(hass) {
      this.hass = hass;
      this.applyConfig();
    }

    rebuild() {
      const resolved = resolveEffect(this.cfg, this.hass);
      this.effect = resolved.effect;
      this.meta = resolved;
      this.particles = [];
      this.bursts = [];
      const n = this.cap();
      const fogN = resolved.fog ? Math.max(4, Math.round(n * 0.25)) : 0;
      for (let i = 0; i < n - fogN; i++) this.particles.push(this.spawn(true));
      if (fogN) {
        const prev = this.effect;
        this.effect = "fog";
        for (let i = 0; i < fogN; i++) this.particles.push(this.spawn(true));
        this.effect = prev;
      }
      this.fog = resolved.fog ? 0.18 : 0;
    }

    spawn(randomY) {
      const w = this.w || window.innerWidth;
      const h = this.h || window.innerHeight;
      const sm = this.speedMul();
      const heavy = !!this.meta.heavy;
      const slow = !!this.meta.slow;
      const base = {
        x: Math.random() * w,
        y: randomY ? Math.random() * h : -20 - Math.random() * 40,
        r: 0,
        vx: 0,
        vy: 0,
        a: 0.4 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        color: "#fff",
        kind: this.effect,
      };

      switch (this.effect) {
        case "snow":
        case "twinkle_snow":
          base.r = (heavy ? 2.5 : 1.5) + Math.random() * (heavy ? 4 : 2.5);
          base.vy = (0.4 + Math.random() * 1.2) * sm * (heavy ? 1.4 : 1) * (slow ? 0.55 : 1);
          base.vx = (Math.random() - 0.5) * 0.6 * sm;
          base.color = this.effect === "twinkle_snow" ? "#e8f6ff" : "#fff";
          break;
        case "rain":
          base.r = 1;
          base.len = 8 + Math.random() * (heavy ? 16 : 10);
          base.vy = (6 + Math.random() * 8) * sm * (heavy ? 1.3 : 1);
          base.vx = -0.8 * sm;
          base.a = 0.25 + Math.random() * 0.35;
          base.color = "rgba(160,190,255,0.7)";
          break;
        case "leaves":
          base.r = 4 + Math.random() * 6;
          base.vy = (0.5 + Math.random() * 1.0) * sm * (slow ? 0.5 : 1);
          base.vx = (Math.random() - 0.5) * 1.4 * sm;
          base.spin = (Math.random() - 0.5) * 0.08 * sm;
          base.rot = Math.random() * Math.PI * 2;
          base.color = ["#c45c14", "#d97706", "#b91c1c", "#a16207", "#92400e"][
            Math.floor(Math.random() * 5)
          ];
          break;
        case "petals":
          base.r = 3 + Math.random() * 4;
          base.vy = (0.3 + Math.random() * 0.7) * sm;
          base.vx = (Math.random() - 0.5) * 0.9 * sm;
          base.spin = (Math.random() - 0.5) * 0.05;
          base.rot = Math.random() * Math.PI * 2;
          base.color = ["#f9a8d4", "#fda4af", "#fbcfe8", "#fecdd3"][
            Math.floor(Math.random() * 4)
          ];
          break;
        case "fireflies":
          base.r = 1.5 + Math.random() * 2;
          base.x = Math.random() * w;
          base.y = Math.random() * h;
          base.vx = (Math.random() - 0.5) * 0.35 * sm;
          base.vy = (Math.random() - 0.5) * 0.35 * sm;
          base.a = 0;
          base.blink = 0.5 + Math.random() * 1.5;
          base.color = "#d9f99d";
          break;
        case "sparkles":
          base.r = 1 + Math.random() * 2;
          base.x = Math.random() * w;
          base.y = Math.random() * h * 0.7;
          base.vx = (Math.random() - 0.5) * 0.2;
          base.vy = (Math.random() - 0.5) * 0.2;
          base.a = 0;
          base.blink = 0.8 + Math.random();
          base.color = "#fef08a";
          break;
        case "seeds":
          base.r = 2 + Math.random() * 2;
          base.vy = (0.15 + Math.random() * 0.35) * sm;
          base.vx = (0.4 + Math.random() * 0.8) * sm * (Math.random() < 0.5 ? -1 : 1);
          base.color = "#f5f5f4";
          break;
        case "hearts":
          base.r = 5 + Math.random() * 7;
          base.vy = -(0.4 + Math.random() * 0.8) * sm;
          base.vx = (Math.random() - 0.5) * 0.6 * sm;
          base.y = randomY ? Math.random() * h : h + 20;
          base.color = ["#fb7185", "#f43f5e", "#e11d48", "#fda4af"][
            Math.floor(Math.random() * 4)
          ];
          break;
        case "shamrocks":
          base.r = 5 + Math.random() * 5;
          base.vy = (0.4 + Math.random() * 0.8) * sm;
          base.vx = (Math.random() - 0.5) * 0.7 * sm;
          base.rot = Math.random() * Math.PI * 2;
          base.spin = (Math.random() - 0.5) * 0.04;
          base.color = ["#16a34a", "#22c55e", "#15803d"][
            Math.floor(Math.random() * 3)
          ];
          break;
        case "eggs":
          base.r = 4 + Math.random() * 5;
          base.vy = (0.35 + Math.random() * 0.7) * sm;
          base.vx = (Math.random() - 0.5) * 0.5 * sm;
          base.color = ["#f9a8d4", "#c4b5fd", "#86efac", "#fde68a", "#67e8f9"][
            Math.floor(Math.random() * 5)
          ];
          break;
        case "bats":
          // Light-enough to read on dark HA themes (near-black bats vanish).
          base.r = 9 + Math.random() * 10;
          base.vy = (Math.random() - 0.5) * 0.6 * sm;
          base.vx = (0.8 + Math.random() * 1.4) * sm * (Math.random() < 0.5 ? -1 : 1);
          base.y = Math.random() * h * 0.65;
          base.a = 0.75 + Math.random() * 0.25;
          base.color = ["#a78bfa", "#c4b5fd", "#ddd6fe", "#9ca3af", "#e7e5e4"][
            Math.floor(Math.random() * 5)
          ];
          base.wing = 0;
          break;
        case "fog":
          base.r = 50 + Math.random() * 100;
          base.vy = (Math.random() - 0.5) * 0.05;
          base.vx = (0.1 + Math.random() * 0.25) * sm;
          base.a = 0.08 + Math.random() * 0.12;
          base.color = "rgba(196,181,253,0.55)";
          break;
        case "confetti":
          base.r = 3 + Math.random() * 4;
          base.vy = (1 + Math.random() * 2) * sm;
          base.vx = (Math.random() - 0.5) * 2 * sm;
          base.spin = (Math.random() - 0.5) * 0.2;
          base.rot = Math.random() * Math.PI * 2;
          base.color = ["#f43f5e", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#fff"][
            Math.floor(Math.random() * 6)
          ];
          break;
        case "fireworks":
          // quiescent; bursts handle drawing
          base.r = 0;
          base.dead = true;
          break;
        default:
          base.r = 2;
          base.vy = sm;
      }
      return base;
    }

    start() {
      if (this.running) return;
      if (this.isPaused() || this.hidden) return;
      this.attach();
      this.running = true;
      this.last = performance.now();
      const loop = (t) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        if (this.hidden || this.isPaused()) {
          this.ctx && this.ctx.clearRect(0, 0, this.w, this.h);
          return;
        }
        const dt = t - this.last;
        if (dt < FRAME_MS) return;
        this.last = t - (dt % FRAME_MS);
        this.tick(Math.min(dt, 50) / 16.67);
      };
      this.raf = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.ctx && this.canvas)
        this.ctx.clearRect(0, 0, this.w || 0, this.h || 0);
    }

    maybeFirework() {
      if (this.effect !== "fireworks" && !this.meta.midnightFireworks) return;
      if (Math.random() > 0.02 * this.speedMul()) return;
      const w = this.w;
      const h = this.h;
      const x = w * (0.15 + Math.random() * 0.7);
      const y = h * (0.15 + Math.random() * 0.4);
      const color = ["#f43f5e", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#fff"][
        Math.floor(Math.random() * 6)
      ];
      const n = 18 + Math.floor(Math.random() * 12);
      const burst = [];
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const sp = 1.5 + Math.random() * 2.5;
        burst.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 1,
          color,
          r: 1.5 + Math.random(),
        });
      }
      this.bursts.push(burst);
    }

    tick(scale) {
      const ctx = this.ctx;
      if (!ctx) return;
      const w = this.w;
      const h = this.h;
      ctx.clearRect(0, 0, w, h);

      if (this.fog > 0 || this.effect === "fog") {
        ctx.fillStyle = `rgba(120,100,160,${this.fog || 0.08})`;
        ctx.fillRect(0, 0, w, h);
      }

      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
        ctx.fillRect(0, 0, w, h);
        this.flash *= 0.85;
        if (this.flash < 0.02) this.flash = 0;
      } else if (this.meta.flash && Math.random() < 0.003) {
        this.flash = 0.35 + Math.random() * 0.35;
      }

      this.maybeFirework();

      // bursts
      for (let b = this.bursts.length - 1; b >= 0; b--) {
        const burst = this.bursts[b];
        let alive = false;
        for (const p of burst) {
          p.x += p.vx * scale;
          p.y += p.vy * scale;
          p.vy += 0.03 * scale;
          p.life -= 0.02 * scale;
          if (p.life <= 0) continue;
          alive = true;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!alive) this.bursts.splice(b, 1);
      }
      ctx.globalAlpha = 1;

      for (let i = 0; i < this.particles.length; i++) {
        let p = this.particles[i];
        if (p.dead) {
          // fireworks idle slots — skip
          continue;
        }
        this.stepParticle(p, scale);
        this.drawParticle(ctx, p);
        if (this.outOfBounds(p)) {
          this.particles[i] = this.spawn(false);
        }
      }

      // Twinkle overlay for christmas snow
      if (this.effect === "twinkle_snow") {
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 6; i++) {
          const x = (Math.sin(performance.now() / 800 + i) * 0.5 + 0.5) * w;
          const y = (Math.cos(performance.now() / 1100 + i * 1.3) * 0.5 + 0.5) * h * 0.5;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    stepParticle(p, scale) {
      p.phase += 0.02 * scale;
      switch (p.kind) {
        case "snow":
        case "twinkle_snow":
          p.x += (p.vx + Math.sin(p.phase) * 0.4) * scale;
          p.y += p.vy * scale;
          break;
        case "rain":
          p.x += p.vx * scale;
          p.y += p.vy * scale;
          break;
        case "leaves":
        case "petals":
        case "shamrocks":
        case "confetti":
          p.x += (p.vx + Math.sin(p.phase) * 0.6) * scale;
          p.y += p.vy * scale;
          p.rot = (p.rot || 0) + (p.spin || 0) * scale;
          break;
        case "eggs":
        case "seeds":
          p.x += (p.vx + Math.sin(p.phase) * 0.3) * scale;
          p.y += p.vy * scale;
          break;
        case "hearts":
          p.x += (p.vx + Math.sin(p.phase) * 0.5) * scale;
          p.y += p.vy * scale;
          break;
        case "fireflies":
        case "sparkles":
          p.x += p.vx * scale;
          p.y += p.vy * scale;
          p.a = 0.15 + Math.abs(Math.sin(performance.now() / 1000 * p.blink + p.phase)) * 0.85;
          if (p.x < 0 || p.x > this.w) p.vx *= -1;
          if (p.y < 0 || p.y > this.h) p.vy *= -1;
          break;
        case "bats":
          p.x += p.vx * scale;
          p.y += (p.vy + Math.sin(p.phase * 2) * 0.4) * scale;
          p.wing += 0.4 * scale;
          break;
        case "fog":
          p.x += p.vx * scale;
          p.y += p.vy * scale;
          break;
        default:
          p.y += (p.vy || 1) * scale;
      }
    }

    outOfBounds(p) {
      if (p.kind === "fireflies" || p.kind === "sparkles") return false;
      if (p.kind === "hearts") return p.y < -30;
      if (p.kind === "bats")
        return p.x < -40 || p.x > this.w + 40 || p.y < -40 || p.y > this.h + 40;
      if (p.kind === "fog") return p.x > this.w + p.r;
      return p.y > this.h + 30 || p.x < -40 || p.x > this.w + 40;
    }

    drawParticle(ctx, p) {
      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y);
      if (p.rot) ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      switch (p.kind) {
        case "rain":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(p.vx * 1.5, p.len || 10);
          ctx.stroke();
          break;
        case "leaves":
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "petals":
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "hearts":
          this.drawHeart(ctx, p.r, p.color);
          break;
        case "shamrocks":
          this.drawShamrock(ctx, p.r, p.color);
          break;
        case "eggs":
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 0.75, p.r, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "bats":
          this.drawBat(ctx, p.r, p.wing || 0);
          break;
        case "fog":
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "confetti":
          ctx.fillRect(-p.r * 0.4, -p.r, p.r * 0.8, p.r * 2);
          break;
        case "seeds":
          ctx.beginPath();
          ctx.arc(0, 0, p.r * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * p.r * 2, Math.sin(a) * p.r * 2);
          }
          ctx.stroke();
          break;
        case "fireflies":
        case "sparkles":
          ctx.shadowBlur = 8;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
      }
      ctx.restore();
    }

    drawHeart(ctx, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      const s = r / 6;
      ctx.moveTo(0, 3 * s);
      ctx.bezierCurveTo(-8 * s, -2 * s, -3 * s, -7 * s, 0, -3 * s);
      ctx.bezierCurveTo(3 * s, -7 * s, 8 * s, -2 * s, 0, 3 * s);
      ctx.fill();
    }

    drawShamrock(ctx, r, color) {
      ctx.fillStyle = color;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(-1, 0, 2, r * 0.7);
    }

    drawBat(ctx, r, wing) {
      // fillStyle already set by drawParticle from p.color
      const flap = Math.sin(wing) * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, 0);
      ctx.quadraticCurveTo(-r * 0.8, -r * (0.6 + flap), -r * 1.4, 0);
      ctx.quadraticCurveTo(-r * 0.7, -r * 0.15, -r * 0.2, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.2, 0);
      ctx.quadraticCurveTo(r * 0.8, -r * (0.6 + flap), r * 1.4, 0);
      ctx.quadraticCurveTo(r * 0.7, -r * 0.15, r * 0.2, 0);
      ctx.fill();
    }
  }

  const engine = new Engine();

  /* ─── Hass binding ─── */
  function bindHass() {
    const ha = document.querySelector("home-assistant");
    if (!ha) return false;
    const apply = () => {
      if (ha.hass) {
        engine.setHass(ha.hass);
        engine.applyConfig();
      }
    };
    apply();
    // Poll lightly for hass updates (weather changes)
    if (!bindHass._timer) {
      bindHass._timer = setInterval(apply, 15000);
    }
    return true;
  }

  function boot() {
    engine.cfg = loadConfig();
    engine.attach();
    if (!bindHass()) {
      const obs = new MutationObserver(() => {
        if (bindHass()) obs.disconnect();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => bindHass(), 2000);
    }
    engine.applyConfig();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* ─── Settings card ─── */
  class WindowpaneCard extends HTMLElement {
    static getStubConfig() {
      return { ...(loadConfig()) };
    }

    setConfig(config) {
      this._config = { ...DEFAULT_CONFIG, ...(config || {}) };
      // Persist card config into localStorage so overlay uses it
      const merged = { ...loadConfig(), ...this._config };
      // Don't store yaml-only keys
      delete merged.type;
      saveConfig(merged);
      this._config = merged;
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      engine.setHass(hass);
      if (this._root) this._updateStatus();
    }

    getCardSize() {
      return 4;
    }

    _render() {
      if (!this._root) {
        this._root = this.attachShadow({ mode: "open" });
      }
      const cfg = this._config || loadConfig();
      const effectOpts = EFFECTS.map(
        (e) =>
          `<option value="${e.id}" ${cfg.effect === e.id ? "selected" : ""}>${e.label}</option>`
      ).join("");
      this._root.innerHTML = `
        <style>
          :host { display:block; }
          .card {
            background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
            border-radius: var(--ha-card-border-radius, 12px);
            padding: 14px 16px 16px;
            box-shadow: var(--ha-card-box-shadow, none);
            border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, transparent);
            color: var(--primary-text-color, #fff);
            font-family: var(--paper-font-body1_-_font-family, inherit);
          }
          h2 { margin: 0 0 4px; font-size: 1.15rem; font-weight: 600; }
          .sub { opacity: 0.7; font-size: 0.85rem; margin-bottom: 12px; }
          .row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin: 8px 0; }
          label { font-size: 0.92rem; }
          select, input[type=range] { flex: 1; max-width: 180px; }
          .status { margin-top: 12px; padding: 8px 10px; border-radius: 8px;
            background: rgba(127,127,127,0.15); font-size: 0.85rem; }
          .btnrow { display:flex; gap:8px; margin-top: 12px; flex-wrap: wrap; }
          button {
            border: none; border-radius: 8px; padding: 8px 12px; cursor: pointer;
            background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff);
            font-weight: 600;
          }
          button.secondary { background: rgba(127,127,127,0.25); color: inherit; }
          .toggle { width: 42px; height: 24px; }
        </style>
        <div class="card">
          <h2>${BRAND.name}</h2>
          <div class="sub">Seasonal weather on your dashboards · v${BRAND.version}</div>

          <div class="row"><label>Enabled</label>
            <input class="toggle" type="checkbox" data-k="enabled" ${cfg.enabled ? "checked" : ""}/></div>

          <div class="row"><label>Mode</label>
            <select data-k="mode">
              <option value="auto" ${cfg.mode === "auto" ? "selected" : ""}>Auto</option>
              <option value="pick" ${cfg.mode === "pick" ? "selected" : ""}>Pick one</option>
            </select></div>

          <div class="row"><label>Effect</label>
            <select data-k="effect">${effectOpts}</select></div>

          <div class="row"><label>Follow weather</label>
            <input class="toggle" type="checkbox" data-k="follow_weather" ${cfg.follow_weather !== false ? "checked" : ""}/></div>

          <div class="row"><label>Follow seasons &amp; holidays</label>
            <input class="toggle" type="checkbox" data-k="follow_seasons_holidays" ${cfg.follow_seasons_holidays !== false ? "checked" : ""}/></div>

          <div class="row"><label>Amount</label>
            <select data-k="amount">
              <option value="low" ${cfg.amount === "low" ? "selected" : ""}>Low</option>
              <option value="medium" ${cfg.amount === "medium" ? "selected" : ""}>Medium</option>
              <option value="high" ${cfg.amount === "high" ? "selected" : ""}>High</option>
            </select></div>

          <div class="row"><label>Speed (${cfg.speed})</label>
            <input type="range" min="1" max="10" data-k="speed" value="${cfg.speed}"/></div>

          <div class="row"><label>Layer</label>
            <select data-k="layer">
              <option value="behind" ${cfg.layer !== "over" ? "selected" : ""}>Behind cards</option>
              <option value="over" ${cfg.layer === "over" ? "selected" : ""}>Over cards</option>
            </select></div>

          <div class="row"><label>Respect reduce motion</label>
            <input class="toggle" type="checkbox" data-k="reduce_motion" ${cfg.reduce_motion !== false ? "checked" : ""}/></div>

          <div class="status" id="status">…</div>
          <div class="btnrow">
            <button type="button" id="pause">Toggle pause helper</button>
            <button type="button" class="secondary" id="apply">Apply</button>
          </div>
        </div>
      `;

      this._root.querySelectorAll("[data-k]").forEach((el) => {
        el.addEventListener("change", () => this._onChange(el));
        el.addEventListener("input", () => {
          if (el.type === "range") {
            el.previousElementSibling && (el.parentElement.querySelector("label").textContent = `Speed (${el.value})`);
            this._onChange(el);
          }
        });
      });
      this._root.getElementById("apply").onclick = () => this._commit();
      this._root.getElementById("pause").onclick = () => this._togglePause();
      this._updateStatus();
    }

    _onChange(el) {
      const k = el.getAttribute("data-k");
      let v;
      if (el.type === "checkbox") v = el.checked;
      else if (el.type === "range") v = Number(el.value);
      else v = el.value;
      this._config = { ...this._config, [k]: v };
    }

    _commit() {
      const cfg = { ...this._config };
      delete cfg.type;
      saveConfig(cfg);
      engine.cfg = cfg;
      engine.applyConfig();
      this._updateStatus();
    }

    _togglePause() {
      if (!this._hass) return;
      const eid = this._config.pause_entity || BRAND.pauseEntity;
      const st = this._hass.states[eid];
      if (!st) return;
      this._hass.callService("input_boolean", st.state === "on" ? "turn_off" : "turn_on", {
        entity_id: eid,
      });
    }

    _updateStatus() {
      const el = this._root && this._root.getElementById("status");
      if (!el) return;
      const resolved = resolveEffect(this._config || loadConfig(), this._hass);
      const paused = engine.isPaused();
      el.textContent = paused
        ? `Paused · would show ${resolved.effect} (${resolved.reason})`
        : `Showing ${resolved.effect} · ${resolved.reason}`;
    }
  }

  if (!customElements.get(BRAND.element)) {
    customElements.define(BRAND.element, WindowpaneCard);
  }

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: BRAND.element,
    name: BRAND.name,
    description: "Seasonal, weather, and holiday particle overlays for your dashboards.",
    preview: true,
  });

  // Expose for debugging / tests
  window[BRAND.id] = {
    BRAND,
    engine,
    loadConfig,
    saveConfig,
    resolveEffect,
    EFFECTS,
    diagnose() {
      return {
        version: BRAND.version,
        path: location.pathname,
        cfg: loadConfig(),
        shouldRun: engine.shouldRunOnDashboard(),
        paused: engine.isPaused(),
        running: engine.running,
        effect: engine.effect,
        meta: engine.meta,
        particles: engine.particles.length,
        canvas: !!engine.canvas,
        parent: engine.canvas && engine.canvas.parentElement && engine.canvas.parentElement.tagName,
        z: engine.canvas && getComputedStyle(engine.canvas).zIndex,
      };
    },
  };
})();
