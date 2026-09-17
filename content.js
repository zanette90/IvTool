console.log("IV Tool content.js carregou");

// rastreador de reload — grava quem chamou antes de recarregar
const _reload = location.reload.bind(location);
location.reload = function () {
  const stack = new Error().stack;
  localStorage.setItem(
    "__reloadLog",
    JSON.stringify({
      quando: new Date().toISOString(),
      stack: stack,
    }),
  );
  console.log(">>> RELOAD chamado, stack:", stack);
  _reload();
};

const ultimoReload = localStorage.getItem("__reloadLog");
if (ultimoReload) {
  console.log(">>> ÚLTIMO RELOAD FOI:", JSON.parse(ultimoReload));
}

const config = JSON.parse(localStorage.getItem("iv-tool-config")) || {
  marcadores: true,
  tooltip: true,
  daily: true,
  anuncios: true,
  antidesconexao: true,
  rotafarm: true,
  promocao: true,
};

let currentToken = null;
let wsMorto = false;
let ultimoXP = Date.now();

let resolveFirst;
let markEnabled = config.marcadores;
let templateRoot = null;

let farmEnabled = false;
let promoTimer = null;

let botaoMenu = null;
let painelMenu = null;

let backHuntTimer = null;

let before;
let after;

var tentativas = 0;

const basesPromise = loadBase();
const huntsPromise = loadHunts();

const templatePromise = loadTemplate();

const Exp = 0.8;
const Exp_hp_vel = 0.95;

const City = ["Cerulean", "Cassino", "Viridian", "Lavender"];

function isOnCity() {
  const local = document.body
    .querySelector(".phud-tloc")
    ?.textContent.split("·")[1];
  if (!local) return false;
  return City.some((c) => local.includes(c));
}

const vantagem = new Map([
  ["WATER", ["FIRE", "GROUND", "ROCK"]],
  ["FIRE", ["GRASS", "ICE", "BUG", "STEEL"]],
  ["GRASS", ["WATER", "GROUND", "ROCK"]],
  ["ELECTRIC", ["WATER", "FLYING"]],
  ["GROUND", ["FIRE", "ELECTRIC", "POISON", "ROCK", "STEEL"]],
  ["ROCK", ["FIRE", "ICE", "FLYING", "BUG"]],
  ["STEEL", ["FAIRY", "ICE", "ROCK"]],
  ["FIGHTING", ["DARK", "ICE", "NORMAL", "ROCK", "STEEL"]],
  ["DARK", ["GHOST", "PSYCHIC"]],
  ["PSYCHIC", ["FIGHTING", "POISON"]],
  ["POISON", ["FAIRY", "GRASS"]],
  ["BUG", ["DARK", "GRASS", "PSYCHIC"]],
  ["FAIRY", ["DARK", "DRAGON", "FIGHTING"]],
  ["GHOST", ["GHOST", "PSYCHIC"]],
  ["DRAGON", ["DRAGON"]],
  ["ICE", ["GRASS", "GROUND", "FLYING", "DRAGON"]],
  ["FLYING", ["GRASS", "FIGHTING", "BUG"]],
  ["NORMAL", []],
]);

const fraquezas = new Map([
  ["NORMAL", ["FIGHTING"]],
  ["GRASS", ["BUG", "FIRE", "FLYING", "ICE", "POISON"]],
  ["FIRE", ["ROCK", "GROUND", "WATER"]],
  ["WATER", ["ELECTRIC", "GRASS"]],
  ["ELECTRIC", ["GROUND"]],
  ["FLYING", ["ELECTRIC", "ICE", "ROCK"]],
  ["ICE", ["FIGHTING", "FIRE", "ROCK", "STEEL"]],
  ["ROCK", ["FIGHTING", "GRASS", "GROUND", "STEEL", "WATER"]],
  ["GROUND", ["ICE", "GRASS", "WATER"]],
  ["STEEL", ["FIGHTING", "FIRE", "GROUND"]],
  ["FIGHTING", ["FAIRY", "FLYING", "PSYCHIC"]],
  ["DARK", ["BUG", "FAIRY", "FIGHTING"]],
  ["PSYCHIC", ["BUG", "DARK", "GHOST"]],
  ["POISON", ["GROUND", "PSYCHIC"]],
  ["BUG", ["FIRE", "FLYING", "ROCK"]],
  ["FAIRY", ["STEEL", "POISON"]],
  ["GHOST", ["DARK", "GHOST"]],
  ["DRAGON", ["DRAGON", "FAIRY", "ICE"]],
]);

function typeColor(tipo) {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(`--pp-type-${tipo}`)
      .trim() || "#2a2a3c"
  );
}

const firstToken = new Promise((resolve) => (resolveFirst = resolve));

const s = document.createElement("script");
s.src = chrome.runtime.getURL("inject.js");
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (e.origin !== window.location.origin) return;

  if (e.data?.type === "IV_TOOL_TOKEN") {
    currentToken = e.data.token;
    resolveFirst(currentToken);
  }
  if (e.data?.type === "IV_TOOL_XP") {
    ultimoXP = e.data.ts;
  }
  if (e.data?.type === "IV_TOOL_WS") {
    wsMorto = e.data.morto;
  }
});

document.querySelector(".promo-close")?.click();

document.addEventListener("click", async (e) => {
  if (
    e.target.closest("[data-guide='dock-map']") ||
    e.target.closest(".map-areas")
  ) {
    setTimeout(applyMarks, 150);
  }

  if (e.target.closest(".ds-x") || e.target.closest(".hunt-marker")) {
    removeMapLegend();
  }

  if (e.target.closest(".dg-resgatar")) {
    document
      .querySelector("[data-guide='dock-daily']")
      ?.classList.remove("iv-tool-daily-alert");
  }

  if (e.target.closest(".iv-tool-tab")) return;

  if (!config.tooltip) return;

  if (e.target.closest(".cfg-x")) {
    document.querySelector("iv-tool-close")?.click();
    return;
  }

  const painelArrastando = e.target.closest(".iv-tool-panel");

  if (painelArrastando?.dataset.dragging) return;

  if (document.querySelector(".iv-tool-panel")) {
    if (e.target.closest(".mkt2-card")) setTimeout(renderPanelIV, 150);
    return;
  }
  if (document.querySelector(".mk-row")) {
    return;
  }

  if (document.querySelector("[title='Store in the Box']")) {
    return;
  }
  renderPanelIV();
});

document.addEventListener(
  "keydown",
  async (e) => {
    if (e.repeat) return;

    if (e.altKey && e.code === "KeyF") {
      e.preventDefault();
      markFarm();
      return;
    }

    if (!(e.altKey && e.code === "KeyK")) return;

    e.preventDefault();

    if (
      document.querySelector(".hunt-marker") ||
      document.querySelector("map-plate")
    ) {
      markMap();
      return;
    }

    if (document.querySelector(".iv-tool-panel")) {
      removePanel();
      return;
    }

    renderPanelIV();
  },
  true,
);

setInterval(() => {
  if (!chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({ type: "heartbeat" }).catch(() => {});
  } catch (e) {}
}, 5000);

rememberGift();
hiddenShinnyAlert();
criarBotaoMenu();

if (config.antidesconexao) backHuntTimer = setInterval(backHunt, 10000);
if (config.promocao) aplicarConfig("promocao");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function calcIV(statFinal, base, level, quality, i) {
  const exp = i === 0 || i === 5 ? Exp_hp_vel : Exp;
  const fator = (level / 100) * Math.pow(quality, exp);
  const growth = (statFinal / fator - base) / 2;
  return Math.min(32, Math.max(0, +growth.toFixed(1)));
}

async function loadTemplate() {
  try {
    const url = chrome.runtime.getURL("panel.html");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    templateRoot = template;
    return template;
  } catch (error) {
    console.error("IV Tool: falha ao carregar", error);
    return null;
  }
}

function getTemplate(temp) {
  const template = templateRoot?.content.querySelector(temp);
  return template?.content.firstElementChild.cloneNode(true) ?? null;
}

function removePanel() {
  document.querySelector(".iv-tool-panel")?.remove();
}

function ivColor(iv) {
  if (iv >= 28) return "#00C2B8";
  if (iv >= 20) return "#23CD5E";
  if (iv >= 15) return "#A0E515";
  return "#FF7F0F";
}

async function renderPanelIV() {
  const c = await readDataIv();
  if (!c) return;

  await templatePromise;
  const panel = getTemplate(".iv-tool-panel-tpl");
  if (!panel) {
    console.error("IV Tool: template do painel nao disponivel");
    return;
  }

  const q = (s) => panel.querySelector(s);

  const setText = (className, value) => {
    const e = q(className);
    if (e) e.textContent = value;
  };

  const base = (await basesPromise)[c.name];

  if (!base) {
    panel
      .querySelectorAll(".iv-tool-tabs, .iv-tool-pane")
      .forEach((e) => e.remove());
    setText(".iv-tool-name", "IV Tool");

    const error = q(".iv-tool-error");
    if (error) {
      error.textContent = `Base nao encontrada: ${c.name}`;
      error.hidden = false;
    }
    mountPanel(panel);
    return;
  }

  const nomes = ["HP", "Atk", "Def", "SpA", "SpD", "Vel"];
  const ivs = c.stats.map((stat, i) => ({
    stat: nomes[i],
    iv: calcIV(stat, base[i + 1], c.level, c.quality, i),
  }));
  const total = +ivs.reduce((a, b) => a + b.iv, 0).toFixed(1);

  setText(".iv-tool-name", c.shinny ? `✨ ${c.name} ` : c.name);
  setText(".iv-tool-total", total);

  setText(".iv-tool-level", "Level " + c.level);
  const power = q(".iv-tool-power");
  if (power) power.textContent = c.power ? `⚡ ${c.power} Power` : "";

  const types = q(".iv-tool-types");
  if (types) {
    types.replaceChildren();

    [base[7], base[8]].forEach((t) => {
      if (!t) return;
      const pill = document.createElement("span");
      pill.className = "iv-tool-type";
      pill.textContent = t;
      pill.style.background = typeColor(t);
      types.appendChild(pill);
    });

    if (c.rarity) {
      const rar = document.createElement("span");
      rar.className = "iv-tool-rarity";
      rar.textContent = `${c.rarity} ×${c.quality.toFixed(2)}`;
      if (c.rarityColor) rar.style.background = c.rarityColor;
      types.appendChild(rar);
    }
  }

  const cor = typeColor(base[7]);
  panel.style.setProperty("--iv-type", cor);

  const imgP = q(".iv-tool-img");
  if (imgP) {
    if (c.img) {
      imgP.src = c.img;
      imgP.hidden = false;
    } else {
      const unknow =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">' +
            '<text x="48" y="70" text-anchor="middle" fill="#3a3a4a" font-family="Georgia, serif" font-size="64" font-weight="700">?</text>' +
            "</svg>",
        );
      imgP.src = unknow;
      imgP.hidden = false;
    }
  }

  renderRows(panel, ivs);

  const totalFill = q(".iv-tool-total-fill");
  if (totalFill) totalFill.style.width = `${((total / 192) * 100).toFixed(0)}%`;

  renderMoves(panel, base[9] || [], c.level);

  renderFarm(panel, base[7], base[9]);

  setupTabs(panel);

  mountPanel(panel);
}

function renderRows(panel, ivs) {
  const table = panel.querySelector(".iv-tool-table");
  if (!table) {
    console.warn("IV Tool: .iv-tool-table faltando");
    return;
  }

  ivs.forEach(({ stat, iv }) => {
    const row = getTemplate(".iv-tool-row");
    if (!row) return;

    row.querySelector(".iv-tool-stat").textContent = stat;
    row.querySelector(".iv-tool-val").textContent = `${iv} / 32`;

    const bar = row.querySelector(".iv-tool-fill");
    bar.style.width = `${Math.min((iv / 32) * 100, 100)}%`;
    bar.style.background = ivColor(iv);

    table.appendChild(row);
  });
}

function renderMoves(panel, moves, level) {
  const box = panel.querySelector(".iv-tool-moves");
  if (!box) return;
  box.replaceChildren();

  moves
    .slice()
    .sort((a, b) => {
      const la = a.learnLevel > level;
      const lb = b.learnLevel > level;
      if (la !== lb) return la - lb;
      return b.power - a.power;
    })
    .forEach((m) => {
      const locked = m.learnLevel > level;

      const row = document.createElement("div");
      row.className = "iv-tool-move" + (locked ? " is-locked" : "");

      const info = document.createElement("div");
      info.className = "iv-tool-move-info";

      const nome = document.createElement("span");
      nome.className = "iv-tool-move-name";
      nome.textContent = m.name;

      info.append(nome);

      if (m.power === 600) {
        const tm = document.createElement("span");
        tm.className = "iv-tool-tm";
        tm.textContent = "💿";
        tm.title = "Aprendido com TM";
        info.append(tm);
      }

      const tipo = document.createElement("span");
      tipo.className = "iv-tool-type";
      tipo.textContent = m.type;
      tipo.style.background = typeColor(m.type);

      info.append(tipo);

      const meta = document.createElement("div");
      meta.className = "iv-tool-move-meta";
      const cd = Math.round(m.cooldownMs / 1000);
      meta.textContent = locked
        ? `🔒 Lv ${m.learnLevel}`
        : `${m.power} • ${cd}s`;

      row.append(info, meta);
      box.appendChild(row);
    });
}

async function renderFarm(panel, tipo, skills) {
  const box = panel.querySelector(".iv-tool-farm");
  if (!box) return;
  box.replaceChildren();

  const porLevel = await findHunt(tipo, skills);
  const levels = Object.keys(porLevel).sort((a, b) => a - b);

  if (!levels.length) {
    const vazio = document.createElement("div");
    vazio.className = "iv-tool-farm-empty";
    vazio.textContent = "Sem rotas para este tipo.";
    box.appendChild(vazio);
    return;
  }

  const tabs = document.createElement("div");
  tabs.className = "iv-tool-farm-tabs";

  const list = document.createElement("div");
  list.className = "iv-tool-farm-list";

  const showLevel = (lv, btn) => {
    tabs
      .querySelectorAll(".iv-tool-farm-lvbtn")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    list.replaceChildren();

    porLevel[lv].forEach((c) => {
      const item = document.createElement("div");
      item.className = "iv-tool-farm-item" + (c.mult === 4 ? " is-super" : "");
      item.textContent = `${c.nome} ×${c.mult}`;
      list.appendChild(item);
    });
  };

  levels.forEach((lv, i) => {
    const btn = document.createElement("button");
    btn.className = "iv-tool-farm-lvbtn";
    btn.textContent = `Lv ${lv}`;
    btn.addEventListener("click", () => showLevel(lv, btn));
    tabs.appendChild(btn);
    if (i === 0) showLevel(lv, btn);
  });

  box.append(tabs, list);
}

function setupTabs(panel) {
  const tabs = [...panel.querySelectorAll(".iv-tool-tab")];
  const panes = [...panel.querySelectorAll(".iv-tool-pane")];

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const alvo = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      panes.forEach((p) => (p.hidden = p.dataset.pane !== alvo));
    });
  });
}

function mountPanel(panel) {
  document.body.appendChild(panel);
  finishPanel(panel);
}

function finishPanel(panel) {
  panel.querySelector(".iv-tool-close")?.addEventListener("click", removePanel);
  const header = panel.querySelector(".iv-tool-header");
  if (header) makeDraggable(panel, header);
}

function makeDraggable(el, handle) {
  let ox = 0,
    oy = 0;

  const onMove = (e) => {
    el.style.left = `${e.clientX - ox}px`;
    el.style.top = `${e.clientY - oy}px`;
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);

    if (el.dataset.dragging) {
      setTimeout(() => delete el.dataset.dragging, 0);
    }
  };

  handle.addEventListener("mousedown", (e) => {
    if (e.target.closest("[data-close]")) return;
    const r = el.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
    e.preventDefault();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

async function loadBase() {
  var bases = {};
  try {
    const response = await fetch(
      "https://poke.idleworld.online/game/creatures.json",
      { credentials: "include" },
    );
    const data = await response.json();
    data.creatures.forEach((e) => {
      bases[e.name] = [
        e.pokeId,
        e.baseHp,
        e.baseAtk,
        e.baseDef,
        e.baseSpAtk,
        e.baseSpDef,
        e.baseSpeed,
        e.type1,
        e.type2,
        e.attacks,
        e.huntLevel,
        e.evolveLevel,
        e.experience,
      ];
    });
  } catch (error) {
    console.log("IV Tool error: " + error);
  }
  return bases;
}

async function readDataIv() {
  try {
    let name;
    let level;
    let quality;
    let stats;
    let shinny;

    // tooltip
    const tip = document.querySelector(".inv-tip");

    if (tip) {
      name = tip.querySelector(".inv-tip-name")?.textContent;

      if (tip.querySelector(".inv-tip-chip.shiny")) {
        name = name.replace(/\s*✨\s*/g, "").trim();
        shinny = true;
      }

      const tops = tip.querySelectorAll(".inv-tip-poke-top > span b");
      level = +tops[0]?.textContent;
      quality = parseFloat(
        tip
          .querySelector(".inv-tip-poke-top > span:nth-child(2) small")
          ?.textContent.replace(/[^\d.]/g, ""),
      );
      stats = [...tip.querySelectorAll(".inv-tip-poke-grid > span b")].map(
        (b) => +b.textContent.replace(/\D/g, ""),
      );

      const power = tip
        .querySelector(".inv-tip-poke-power b")
        ?.textContent.trim();

      const rarEl = tip.querySelector(
        ".inv-tip-poke-top > span:nth-child(2) b",
      );
      const rarity = rarEl?.textContent.trim();
      const rarityColor = rarEl ? rarEl.style.color : null;

      return {
        name,
        level,
        quality,
        stats,
        shinny,
        power,
        rarity,
        rarityColor,
      };
    }

    // tela de detalhe
    const tela = document.querySelector(".team-detail");
    if (tela) {
      name = document
        .querySelector(".team-name")
        .childNodes[0].textContent.trim();
      level = +document.querySelector(".team-lvl").textContent.split(" ")[1];
      quality = parseFloat(
        document.querySelector(".dex-type").title.replace(/[^\d.]/g, ""),
      );
      stats = [...document.querySelectorAll(".dex-stat-v")].map(
        (s) => +s.textContent.replace(/\D/g, ""),
      );

      const canvas = tela.querySelector(".team-sprite canvas");
      const img = canvas ? canvas.toDataURL("image/png") : null;

      const powerB = tela.querySelector(".team-lvl b");
      const power = powerB ? powerB.textContent.replace(/[^\d]/g, "") : null;
      const dexType = tela.querySelector(".dex-type");
      const rarity = dexType?.textContent.split("×")[0].trim();
      const rarityColor = dexType ? dexType.style.backgroundColor : null;

      return {
        name,
        level,
        quality,
        stats,
        shinny: false,
        img,
        power,
        rarity,
        rarityColor,
      };
    }

    const market = document.querySelector(".mkt2-details-body");

    if (market) {
      const nameFull = market.querySelector(".mkt2-details-name")?.textContent;

      if (!nameFull) return null;
      name = nameFull;
      shinny = false;

      if (name.includes("Shiny")) {
        name = name.replace(/\s*✨|Shiny\s*/g, "").trim();
        shinny = true;
      }
      name = name.split(" ")[0];

      level = parseInt(nameFull.split("Lv.")[1], 10);

      quality = parseFloat(
        market
          .querySelector(".mkt2-stat b small")
          ?.textContent.replace(/[^\d.]/g, ""),
      );

      stats = [...market.querySelectorAll(".mkt2-statcell-v")].map(
        (b) => +b.textContent.replace(/\D/g, ""),
      );

      const img = market.querySelector(".poke-icon-img")?.src || null;

      const rarB = market.querySelector(".mkt2-stat b");
      const rarity = rarB?.textContent.split("×")[0].trim();
      const rarityColor = rarB ? rarB.style.color : null;
      let power = null;
      [...market.querySelectorAll(".mkt2-stat")].forEach((st) => {
        if (st.querySelector("span")?.textContent.includes("Power")) {
          power = st.querySelector("b")?.textContent.replace(/[^\d.]/g, "");
        }
      });

      return {
        name,
        level,
        quality,
        stats,
        shinny,
        img,
        power,
        rarity,
        rarityColor,
      };
    }

    return null;
  } catch (error) {
    console.log("IV Tool erro ao capturar os dados", error);
    return {};
  }
}

async function loadPokedex() {
  try {
    const auth = await getToken();
    const response = await fetch(
      "https://poke.idleworld.online/api/game/pokedex",
      { headers: { Authorization: auth } },
    );

    if (!response.ok) return;
    const { species } = await response.json();
    return new Set(species.filter((p) => p.caught === true).map((p) => p.id));
  } catch (error) {
    console.log("IV Tool : erro ao carregar pokedex. " + error);
    return new Set();
  }
}

async function getToken(timeout = 15000) {
  if (currentToken) return currentToken;
  return Promise.race([
    firstToken,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("token nao capturado")), timeout),
    ),
  ]);
}

async function loadUncaught(caughtIds) {
  const bases = await basesPromise;

  const uncaughtNames = new Set();
  if (!caughtIds) return uncaughtNames;

  const isOutland = (raw) => raw >= 10500 && raw <= 10547;

  const idByName = new Map();
  for (const [name, stats] of Object.entries(bases)) {
    if (!isOutland(stats[0])) idByName.set(name, limpaId(stats[0]));
  }

  const resolveId = (name, raw) =>
    isOutland(raw)
      ? idByName.get(name.split(/[\s-]/).slice(1).join(" "))
      : limpaId(raw);

  for (const [name, stats] of Object.entries(bases)) {
    const id = resolveId(name, stats[0]);
    if (id == null) continue;
    if (!caughtIds.has(id)) uncaughtNames.add(name);
  }

  return uncaughtNames;
}

async function markMap() {
  markEnabled = !markEnabled;
  await applyMarks();
}

async function applyMarks() {
  if (!markEnabled) {
    document
      .querySelectorAll(".poke-uncaught")
      .forEach((m) => m.classList.remove("poke-uncaught"));
    showHint();
    return;
  }

  const caughtIds = await loadPokedex();
  const uncaught = await loadUncaught(caughtIds);

  document.querySelectorAll(".hunt-marker").forEach((mark) => {
    const name = mark.querySelector(".hunt-name")?.textContent.trim();
    if (name && uncaught.has(name)) {
      mark.classList.add("poke-uncaught");
    }
  });

  document.querySelector(".poke-uncaught") ? showLegend() : showAllCaught();
}

function limpaId(raw) {
  if (raw === 10001) return 9;
  if (raw >= 13000 && raw < 14000) return raw - 13000;
  if (raw >= 14000 && raw < 15000) return raw - 14000;
  if (raw >= 10000 && raw <= 10547) return null;
  return raw;
}

function ensureMapLegend() {
  let legend = document.querySelector(".iv-tool-legend");
  if (!legend) {
    legend = getTemplate(".iv-tool-legend-tpl");
    if (!legend) {
      console.error("IV Tool: template da legenda nao disponivel");
      return null;
    }

    document.body.appendChild(legend);

    const map = document.querySelector(".map-window");
    if (map) {
      const r = map.getBoundingClientRect();
      legend.style.left = `${r.right + 16}px`;
      legend.style.top = `${r.top + r.height / 2}px`;
      legend.style.transform = "translateY(-50%)";
      legend.style.bottom = "auto";
    }

    legend
      .querySelector(".iv-tool-legend-close")
      ?.addEventListener("click", removeMapLegend);

    const header = legend.querySelector(".iv-tool-legend-header");
    if (header) makeDraggable(legend, header);
  }
  return legend;
}

function setLegendBody(temp, fill) {
  const legend = ensureMapLegend();
  const body = legend?.querySelector(".iv-tool-legend-body");
  if (!body) return;

  const node = getTemplate(temp);
  body.replaceChildren();
  if (node) {
    fill?.(node);
    body.appendChild(node);
  }
}

function showLegend() {
  const uncaughts = document.querySelectorAll(".poke-uncaught").length;
  setLegendBody(".iv-tool-legend-uncaught", (node) => {
    node.querySelector(".iv-tool-legend-count").textContent = uncaughts;
  });
}

function showFarmLegend() {
  setLegendBody(".iv-tool-legend-farm");
}

function showHint() {
  setLegendBody(".iv-tool-legend-hint");
}

function showAllCaught() {
  setLegendBody(".iv-tool-legend-caught");
}

function removeMapLegend() {
  document.querySelector(".iv-tool-legend")?.remove();
}

async function rememberGift() {
  if (!config.daily) return;
  try {
    const auth = await getToken();
    const response = await fetch(
      "https://poke.idleworld.online/api/game/daily",
      { headers: { Authorization: auth } },
    );

    if (!response.ok) return;

    const { canClaim, claimedToday } = await response.json();

    const button = document.querySelector("[data-guide=dock-daily]");

    if (!claimedToday && canClaim) {
      button?.classList.add("iv-tool-daily-alert");
    }
  } catch (error) {
    console.log("IV Tool ", error);
  }
}

function fecharMenu() {
  painelMenu?.remove();
  painelMenu = null;
}

async function criarBotaoMenu() {
  await templatePromise;

  botaoMenu = document.createElement("button");
  botaoMenu.className = "iv-tool-menu-btn";
  botaoMenu.title = "IV Helper";

  const badge = document.createElement("span");
  badge.className = "hero-badge";
  badge.textContent = "⚙ IV";
  botaoMenu.append(badge, " Tool");

  document.body.appendChild(botaoMenu);

  botaoMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    if (painelMenu) {
      fecharMenu();
      return;
    }
    painelMenu = getTemplate(".ivtool_menu");
    if (!painelMenu) return;
    document.body.appendChild(painelMenu);

    painelMenu
      .querySelector("[data-close]")
      ?.addEventListener("click", fecharMenu);

    painelMenu.querySelectorAll(".switch").forEach((sw) => {
      const chave = sw.dataset.cfg;
      if (!chave) return;

      sw.setAttribute("aria-checked", config[chave]);

      sw.addEventListener("click", () => {
        config[chave] = !config[chave];
        sw.setAttribute("aria-checked", config[chave]);
        localStorage.setItem("iv-tool-config", JSON.stringify(config));
        aplicarConfig(chave);
      });
    });
    const header = painelMenu.querySelector(".header");
    if (header) makeDraggable(painelMenu, header);
  });

  document.addEventListener("click", (event) => {
    if (
      painelMenu &&
      !painelMenu.contains(event.target) &&
      event.target !== botaoMenu
    ) {
      fecharMenu();
    }
  });
}

function aplicarConfig(chave) {
  if (chave === "marcadores") {
    markEnabled = config.marcadores;
    applyMarks();
  }

  if (chave === "rotafarm") {
    if (config.rotafarm) {
      if (!farmEnabled) markFarm();
    } else {
      if (farmEnabled) markFarm();
    }
  }

  if (chave === "anuncios") {
    hiddenShinnyAlert();
  }

  if (chave === "antidesconexao") {
    if (config.antidesconexao) {
      if (!backHuntTimer) backHuntTimer = setInterval(backHunt, 10000);
    } else {
      clearInterval(backHuntTimer);
      backHuntTimer = null;
    }
  }

  if (chave === "promocao") {
    if (config.promocao) {
      if (!promoTimer) {
        document.querySelector(".promo-close")?.click();
        promoTimer = setInterval(
          () => document.querySelector(".promo-close")?.click(),
          500,
        );
      }
    } else {
      clearInterval(promoTimer);
      promoTimer = null;
    }
  }
}

function hiddenShinnyAlert() {
  const existente = document.getElementById("hide-shiny-style");

  if (!config.anuncios) {
    existente?.remove();
    return;
  }

  if (existente) return;

  const style = document.createElement("style");
  style.id = "hide-shiny-style";
  style.textContent = `.sa-overlay { display: none !important; }`;
  document.head.appendChild(style);
}

function backHunt() {
  const local = document.body
    .querySelector(".phud-tloc")
    ?.textContent.split("·")[1];

  let huntName;
  let huntAnterior = localStorage.getItem("hunt")?.trim();

  if (!isOnCity()) {
    huntName = document.body.querySelector(".phud-tloc").textContent;

    if (huntName?.includes("·")) {
      huntName = huntName.split("·")[1].trim();
      localStorage.setItem("hunt", huntName);
    }
  }

  if (isOnCity() && huntAnterior) {
    console.log("Voltando pra hunt");
    if (tentativas >= 10) {
      localStorage.removeItem("hunt");
      return;
    }

    document.querySelector(".promo-close")?.click();

    document.querySelector(".npc-plate-btn")?.click();

    let before = localStorage.getItem("healHour");

    if (before) {
      let now = new Date();
      let seconds = (now - before) / 1000;

      if (seconds < 600) {
        tentativas++;
      }
    }

    setTimeout(() => {
      document.querySelector(".npc-dlg-btn")?.click();
      localStorage.setItem("healHour", Date.now());
    }, 200);

    let map = document.querySelector("[data-guide='dock-map']");
    map?.click();
    var buscar = () =>
      [...document.querySelectorAll(".hunt-name")].find(
        (m) => m.textContent.trim() === huntAnterior,
      );

    setTimeout(() => {
      var huntKanto = buscar();
      if (huntKanto) {
        huntKanto.closest(".hunt-marker")?.click();
        return;
      }

      document
        .querySelectorAll(
          '[title="Unlocks at level 150"],[title="Desbloqueia no nível 150"],[title="Se desbloquea en el nivel 150"]',
        )[0]
        ?.click();

      setTimeout(() => {
        var huntOutland = buscar();
        if (huntOutland) {
          huntOutland.closest(".hunt-marker")?.click();
          return;
        }

        document
          .querySelectorAll(
            '[title="Unlocks at level 500"]',
            '[title="Desbloqueia no nível 500"]',
            '[title="Se desbloquea en el nivel 500"]',
          )[0]
          ?.click();

        setTimeout(() => {
          var huntOrre = buscar();

          if (huntOrre) {
            huntOrre.closest(".hunt-marker")?.click();

            setTimeout(() => {
              var button = document.querySelector(".adm-btn-full");
              button?.click();
              return;
            }, 600);
          }
        }, 600);
        return;
      }, 600);
    }, 600);
  }
}

async function loadHunts() {
  const mapa = new Map();
  try {
    const response = await fetch(
      "https://poke.idleworld.online/api/game/map-markers",
      { credentials: "include" },
    );
    if (!response.ok) return mapa;
    const data = await response.json();
    const hunts = Array.isArray(data) ? data : data.hunts || [];
    hunts.forEach((h) => {
      if (h.name != null) mapa.set(h.name, h.level);
    });
  } catch (error) {
    console.log("IV Tool erro " + error);
  }
  return mapa;
}

function cancelaVantagem(atk, t) {
  return !!t && (fraquezas.get(atk) ?? []).includes(t);
}

function calcMult(atk, t1, t2) {
  const v = vantagem.get(atk) ?? [];
  const fraco1 = v.includes(t1);
  const fraco2 = v.includes(t2);

  if (!fraco1 && !fraco2) return 0;

  let mult = fraco1 && fraco2 ? 4 : 2;

  const cancela1 = !fraco1 && cancelaVantagem(atk, t1);
  const cancela2 = !fraco2 && cancelaVantagem(atk, t2);
  if (cancela1 || cancela2) mult -= 2;

  return mult;
}

async function findHunt(type, skills) {
  const tipo = type.toUpperCase();

  const bases = await basesPromise;
  const hunts = await huntsPromise;

  const atkTypes =
    tipo === "NORMAL"
      ? [
          ...new Set(
            (skills || [])
              .map((s) => s.type?.toUpperCase())
              .filter((t) => t && t !== "NORMAL"),
          ),
        ]
      : [tipo];

  const i = { POKEID: 0, TYPE1: 7, TYPE2: 8, HUNT: 10 };

  const alvos = Object.entries(bases)
    .filter(([nome]) => hunts.has(nome))
    .map(([nome, e]) => {
      const t1 = e[i.TYPE1];
      const t2 = e[i.TYPE2];

      const mult = atkTypes.reduce(
        (melhor, atk) => Math.max(melhor, calcMult(atk, t1, t2)),
        0,
      );

      return {
        nome,
        pokeId: e[i.POKEID],
        type1: t1,
        type2: t2,
        huntLevel: hunts.get(nome),
        xp: e[e.length - 1],
        mult,
      };
    })
    .filter((c) => c.mult > 0);

  const porLevel = {};
  for (const c of alvos) {
    (porLevel[c.huntLevel] ??= []).push(c);
  }

  for (const level of Object.keys(porLevel)) {
    porLevel[level].sort((a, b) => {
      if (b.mult !== a.mult) return b.mult - a.mult;
      return b.xp - a.xp;
    });
  }

  return porLevel;
}

function getPokeActive() {
  return document
    .querySelector(".phud-mon.active")
    ?.title.replace(/\s*\(active\)\s*/i, "")
    .trim();
}

// mark rota de farm.

async function markFarm() {
  farmEnabled = !farmEnabled;

  document
    .querySelectorAll(".farm-x2, .farm-x4")
    .forEach((m) => m.classList.remove("farm-x2", "farm-x4"));

  if (!farmEnabled) {
    removeMapLegend();
    return;
  }

  let skills = null;
  const tipo = document
    .querySelector(".phud-mon.active .pk-ts-type")
    ?.getAttribute("alt");
  if (!tipo) return;

  if (tipo.toUpperCase() === "NORMAL") {
    const nomeAtivo = getPokeActive();
    if (nomeAtivo) {
      const bases = await basesPromise;
      skills = bases[nomeAtivo]?.[9];
    }
  }

  const porLevel = await findHunt(tipo, skills);

  const multPorNome = new Map();
  Object.values(porLevel).forEach((lista) =>
    lista.forEach((c) => multPorNome.set(c.nome, c.mult)),
  );

  document.querySelectorAll(".hunt-marker").forEach((mark) => {
    const nome = mark.querySelector(".hunt-name")?.textContent.trim();
    const mult = multPorNome.get(nome);
    if (mult === 4) mark.classList.add("farm-x4");
    else if (mult === 2) mark.classList.add("farm-x2");
  });

  document.querySelector(".farm-x2, .farm-x4")
    ? showFarmLegend()
    : removeMapLegend();
}

async function checkConnect() {
  let data = new Date();
  const minuto = data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  console.log("Executando " + minuto);
  if (wsMorto) {
    console.log("WS morto tentar reconectar");
    location.reload();
    return;
  }

  const semXP = Date.now() - ultimoXP;
  console.log("sem XP há", Math.round(semXP / 1000), "s");

  if (isOnCity()) {
    return;
  }

  if (semXP > 180000) {
    console.log("hunt parada, recarregando");
    location.reload();
  }
}

let gastar = 500000000;

async function autoBuyEevee() {
  console.log("Ainda posso gastar: " + gastar);
  const fechar = document.querySelector(".cfg-x");

  document.querySelector(".npc-plate-btn")?.click();
  await sleep(600);

  document.querySelector(".npc-dlg-btn")?.click();
  await sleep(600);

  const dinheiro = document
    .querySelector(".nsh-gold")
    ?.textContent.split(" ")[1]
    ?.replaceAll(".", "");

  console.log("dinheiro:", dinheiro);

  const eevee = document.querySelectorAll(".mln-card")[1];
  if (!eevee) return;

  const price = Number(
    eevee
      .querySelector(".mln-price")
      ?.textContent.split(" ")[1]
      .replaceAll(".", ""),
  );
  console.log("price:", price);

  if (gastar - price >= 0) {
    eevee.querySelector(".mk-buy")?.click();
    gastar -= price;
  }

  if (document.querySelector(".mln-warn")) {
    console.log("time cheio");
    fechar?.click();
  }
}

async function depot() {
  await sleep(2000);

  [...document.querySelectorAll(".npc-plate-btn")]
    .find((a) => a.textContent === "Open Depot")
    ?.click();

  await sleep(2000);
  document.querySelector(".npc-dlg-btn")?.click();
  await sleep(2000);

  [...document.querySelectorAll(".dep-tab")]
    .find((a) => a.textContent === "⚔ Pokémon")
    ?.click();

  await sleep(2000);
  const v = document.querySelectorAll("[title='Store in the Box']");
  console.log(v);

  for (i = 0; i <= v.length; i++) {
    if (i >= 1) {
      await sleep(600);
      v[i]?.click();
    }
  }

  document.querySelector(".cfg-x")?.click();
}

setInterval(depot, 20000);
//setInterval(autoBuyEevee, 10000);

setInterval(checkConnect, 60000);
