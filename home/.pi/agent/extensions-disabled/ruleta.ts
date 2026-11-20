/**
 * Ruleta de premios — extensión para Pi
 *
 * La ruleta vive como un footer persistente en la parte de abajo de la
 * pantalla. Siempre se ve, y cuando el usuario envía un texto (sin contar
 * los comandos "/"), la ruleta gira en su lugar y al detenerse anuncia
 * el premio con su descripción.
 *
 * Comandos:
 *   /ruleta          → gira la ruleta manualmente
 *   /ruleta-stats    → muestra cuántas veces salió cada premio
 *   /ruleta-toggle   → activa/desactiva el giro automático al enviar texto
 *   /ruleta-reset    → resetea las estadísticas
 *
 * El giro automático se puede desactivar antes de iniciar pi con la variable
 * de entorno PI_RULETA=off, o dentro del chat con /ruleta-toggle.
 *
 * Las estadísticas se guardan en ~/.pi/ruleta-stats.json. Los premios están
 * en PREMIOS más abajo: se pueden editar para añadir, quitar o rebalancear.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { exec } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ============================================================
//  Premios
// ============================================================
interface Premio {
	nombre: string;
	emoji: string;
	bg: number;        // color de fondo (ANSI 256)
	peso: number;      // probabilidad relativa
	descripcion: string;
	raro?: boolean;
}

const PREMIOS: Premio[] = [
	{ nombre: "Jackpot",    emoji: "💎", bg: 220, peso: 3,  descripcion: "¡Premio mayor! Triple efecto", raro: true },
	{ nombre: "Corona",     emoji: "👑", bg: 178, peso: 2,  descripcion: "El premio del rey",           raro: true },
	{ nombre: "Racha x2",   emoji: "🔥", bg: 196, peso: 12, descripcion: "Próximo mensaje con doble efecto" },
	{ nombre: "Arcoíris",   emoji: "🌈", bg: 141, peso: 11, descripcion: "Texto multicolor animado" },
	{ nombre: "Estelar",    emoji: "✨", bg: 51,  peso: 10, descripcion: "Brillo estelar a tu alrededor" },
	{ nombre: "Suerte x3",  emoji: "🍀", bg: 42,  peso: 10, descripcion: "Tres giros con efecto extra" },
	{ nombre: "Dorado",     emoji: "💬", bg: 214, peso: 13, descripcion: "Mensaje dorado brillante" },
	{ nombre: "Sorpresa",   emoji: "🎁", bg: 46,  peso: 10, descripcion: "Tu mensaje llega envuelto" },
	{ nombre: "Trueno",     emoji: "⚡", bg: 226, peso: 9,  descripcion: "Rayo veloz: respuesta rápida" },
	{ nombre: "Fantasma",   emoji: "💀", bg: 240, peso: 10, descripcion: "Mensaje etéreo y misterioso" },
	{ nombre: "Común",      emoji: "🎯", bg: 67,  peso: 10, descripcion: "Sin efecto extra, pero giroste" },
];

function elegirPremio(): number {
	const pesos = PREMIOS.map(p => p.peso);
	const total = pesos.reduce((a, b) => a + b, 0);
	let r = Math.random() * total;
	for (let i = 0; i < pesos.length; i++) {
		r -= pesos[i];
		if (r <= 0) return i;
	}
	return PREMIOS.length - 1;
}

// ============================================================
//  Persistencia: ~/.pi/ruleta-stats.json
// ============================================================
const STATS_PATH = join(process.env.HOME ?? "", ".pi", "ruleta-stats.json");

interface Stats {
	contadores: Record<number, number>;
	total: number;
	ultimo?: { idx: number; ts: number };
}

function cargarStats(): Stats {
	try {
		if (existsSync(STATS_PATH)) {
			const raw = JSON.parse(readFileSync(STATS_PATH, "utf-8"));
			return {
				contadores: raw.contadores ?? {},
				total: raw.total ?? 0,
				ultimo: raw.ultimo,
			};
		}
	} catch { /* ignore */ }
	return { contadores: {}, total: 0 };
}

function guardarStats(stats: Stats): void {
	try {
		mkdirSync(dirname(STATS_PATH), { recursive: true });
		writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
	} catch { /* ignore */ }
}

// ============================================================
//  Estado global (compartido entre el footer y los handlers)
// ============================================================
const SPIN_DURATION = 4500;
const REVEAL_DURATION = 1500;

let stats: Stats = cargarStats();
let spinAuto = process.env.PI_RULETA !== "off";
let themeAuto = process.env.PI_RULETA_NOTHEME !== "1";

// ============================================================
//  Cambio de tema de Omarchy (en paralelo con cada giro)
// ============================================================
interface ThemeState {
	disponible: boolean;
	inicializado: boolean;
	temas: string[];              // nombres en formato display ("Catppuccin Latte")
	actual: string;               // nombre display del tema actual
	temaPendiente: string | null; // nombre display del tema al que estamos cambiando
}

const themeState: ThemeState = {
	disponible: false,
	inicializado: false,
	temas: [],
	actual: "",
	temaPendiente: null,
};

function nombreADirectorio(displayName: string): string {
	return displayName.toLowerCase().replace(/\s+/g, "-");
}

function ejecutar(cmd: string, timeout = 10000): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		exec(cmd, { timeout }, (err, stdout, stderr) => {
			resolve({ stdout: stdout ?? "", stderr: stderr ?? (err ? String(err.message) : "") });
		});
	});
}

async function initOmarchy(): Promise<void> {
	if (themeState.inicializado) return;
	themeState.inicializado = true;
	try {
		const which = await ejecutar("command -v omarchy", 1000);
		if (!which.stdout.trim()) return;

		const listOut = await ejecutar("omarchy theme list", 3000);
		themeState.temas = listOut.stdout
			.split("\n").map(l => l.trim()).filter(Boolean);
		if (themeState.temas.length === 0) return;

		themeState.disponible = true;

		const curOut = await ejecutar("omarchy theme current", 1000);
		themeState.actual = curOut.stdout.trim();
	} catch {
		themeState.disponible = false;
	}
}

function elegirTemaAleatorio(): string | null {
	if (!themeState.disponible || themeState.temas.length === 0) return null;

	const actualKebab = nombreADirectorio(themeState.actual);
	const pendienteKebab = themeState.temaPendiente
		? nombreADirectorio(themeState.temaPendiente)
		: null;

	// Excluir el tema actual Y el que estamos cambiando ahora (si hay uno en vuelo)
	let candidatos = themeState.temas.filter(t => {
		const kebab = nombreADirectorio(t);
		if (kebab === actualKebab) return false;
		if (pendienteKebab && kebab === pendienteKebab) return false;
		return true;
	});

	// Fallback: si la exclusión dejó la lista vacía, permitir todos menos el actual
	if (candidatos.length === 0) {
		candidatos = themeState.temas.filter(t => nombreADirectorio(t) !== actualKebab);
	}
	// Último fallback: si solo existe el actual, devolver ese
	if (candidatos.length === 0) candidatos = themeState.temas;

	return candidatos[Math.floor(Math.random() * candidatos.length)];
}

async function cambiarTemaAleatorio(): Promise<void> {
	if (!themeState.inicializado) await initOmarchy();
	if (!themeState.disponible) return;

	const tema = elegirTemaAleatorio();
	if (!tema) return;

	themeState.temaPendiente = tema;
	// Fire and forget (no await para no bloquear el handler de input)
	const safe = tema.replace(/"/g, '\\"');
	ejecutar(`omarchy theme set "${safe}"`, 15000).then(() => {
		themeState.actual = tema;
		themeState.temaPendiente = null;
	});
}

interface AnimState {
	rotation: number;
	startRotation: number;
	targetRotation: number;
	phase: "idle" | "spin" | "reveal";
	phaseStart: number;
	premioIdx: number;
	ultimoTexto: string;
}

const anim: AnimState = {
	rotation: 0,
	startRotation: 0,
	targetRotation: 0,
	phase: "idle",
	phaseStart: 0,
	premioIdx: -1,
	ultimoTexto: "Esperando primer mensaje…",
};

function startSpin(idx: number, texto: string): void {
	anim.premioIdx = idx;
	anim.ultimoTexto = texto;

	const N = PREMIOS.length;
	const arc = (2 * Math.PI) / N;
	// Para que el segmento i quede bajo el puntero (que apunta arriba),
	// la ruleta debe rotar -(i*arc + arc/2).
	const destino = -(idx * arc + arc / 2);
	const vueltas = 5 + Math.random() * 2;

	// Respetar la rotación acumulada (sin saltos hacia atrás)
	const currentMod = ((anim.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	const destinoMod = ((destino % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	let delta = destinoMod - currentMod;
	if (delta <= 0) delta += 2 * Math.PI;
	delta += vueltas * 2 * Math.PI;

	anim.startRotation = anim.rotation;
	anim.targetRotation = anim.rotation + delta;
	anim.phase = "spin";
	anim.phaseStart = performance.now();

	stats.contadores[idx] = (stats.contadores[idx] || 0) + 1;
	stats.total++;
	stats.ultimo = { idx, ts: Date.now() };
	guardarStats(stats);
}

function stepAnim(now: number): boolean {
	if (anim.phase === "spin") {
		const t = Math.min(1, (now - anim.phaseStart) / SPIN_DURATION);
		const ease = 1 - Math.pow(1 - t, 3);
		anim.rotation = anim.startRotation + (anim.targetRotation - anim.startRotation) * ease;
		if (t >= 1) {
			anim.rotation = anim.targetRotation;
			anim.phase = "reveal";
			anim.phaseStart = now;
		}
		return true;
	} else if (anim.phase === "reveal") {
		if (now - anim.phaseStart >= REVEAL_DURATION) {
			anim.phase = "idle";
		}
		return true;
	}
	return false;
}

// ============================================================
//  Render de la ruleta en una grilla 2:1 (cada celda = "██" ancho, 1 alto)
// ============================================================
const RADIO = 4;
const ANCHO = RADIO * 2 + 1;       // 9 celdas
const ALTO = RADIO + 1;            // 5 filas
const CENTRO_X = RADIO;
const CENTRO_Y = RADIO / 2;

function bg256(n: number): string { return `\x1b[48;5;${n}m`; }
function fg256(n: number): string { return `\x1b[38;5;${n}m`; }
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function renderRuletaLines(rotation: number, premioGanador: number | null): string[] {
	const N = PREMIOS.length;
	const arc = (2 * Math.PI) / N;
	const lines: string[] = [];
	for (let gy = 0; gy < ALTO; gy++) {
		let row = "";
		for (let gx = 0; gx < ANCHO; gx++) {
			const x = gx - CENTRO_X;
			const y = (gy - CENTRO_Y) * 2;
			const dist = Math.sqrt(x * x + y * y);
			if (dist > RADIO) { row += "  "; continue; }
			let angle = Math.atan2(x, -y);
			if (angle < 0) angle += 2 * Math.PI;
			angle = (angle - rotation + 2 * Math.PI * 100) % (2 * Math.PI);
			// Clamp defensivo: por aritmética de punto flotante, el módulo puede
			// dar exactamente 2π, lo que haría segIdx === N y crashear al leer
			// PREMIOS[segIdx].bg (ver crash al cambiar de tema).
			const segIdx = Math.min(N - 1, Math.max(0, Math.floor(angle / arc)));
			const esGanador = premioGanador === segIdx;
			if (esGanador && premioGanador !== null) {
				row += bg256(255) + fg256(232) + BOLD + "██" + RESET;
			} else {
				row += bg256(PREMIOS[segIdx].bg) + "  " + RESET;
			}
		}
		lines.push(row);
	}
	return lines;
}

// ============================================================
//  Footer persistente
// ============================================================
function center(text: string, width: number): string {
	// IMPORTANTE: medir con visibleWidth() porque emojis (✨, 💎, 👑, 🔥, 🌈…)
	// ocupan 2 columnas en la terminal aunque .length reporte 1 code unit.
	// Antes usábamos .length ignorando wide chars → líneas 1 col más anchas → crash.
	const visibleLen = visibleWidth(text);
	if (visibleLen >= width) {
		// No se puede centrar algo más ancho que la pantalla: truncar como red
		// de seguridad para no romper el invariante "toda línea <= width".
		return truncateToWidth(text, width);
	}
	const pad = Math.max(0, Math.floor((width - visibleLen) / 2));
	return " ".repeat(pad) + text + " ".repeat(width - visibleLen - pad);
}

function makeFooter(tui: { requestRender: () => void }, theme: any, footerData: any) {
	const intervalId = setInterval(() => {
		const now = performance.now();
		const changed = stepAnim(now);
		// Solo pedimos render cuando algo cambió en pantalla
		if (changed || anim.phase !== "idle") {
			tui.requestRender();
		}
	}, 1000 / 30);

	const disposeBranch = footerData.onBranchChange(() => tui.requestRender());

	const dim = (s: string) => theme.fg("dim", s);
	const accent = (s: string) => theme.fg("accent", s);

	return {
		dispose() {
			clearInterval(intervalId);
			disposeBranch();
		},
		invalidate() {},
		render(width: number): string[] {
			// Layout de 7 líneas:
			//   🎰 RULETA DE PREMIOS
			//         ▼
			//     [ruleta de 5 filas centrada]
			//   [premio actual / barra de progreso]
			//   [stats + barra de reveal]

			// Si la terminal es muy angosta, fallback de una línea
			if (width < 50) {
				const p = anim.premioIdx >= 0 ? PREMIOS[anim.premioIdx] : null;
				let estado: string;
				if (anim.phase === "spin") {
					estado = `${dim("🎰 girando...")}`;
				} else if (p) {
					estado = `${p.emoji} ${BOLD}${p.nombre}${RESET}`;
				} else {
					estado = dim(anim.ultimoTexto);
				}
				return [truncateToWidth(`${accent("🎰")} ${estado}  ${dim("total: " + stats.total)}`, width)];
			}

			const ruletaGanador = anim.phase === "reveal" ? anim.premioIdx : null;
			const ruletaLines = renderRuletaLines(anim.rotation, ruletaGanador);
			const lines: string[] = [];

			// Título
			lines.push(center(`${BOLD}${accent("🎰 RULETA DE PREMIOS")}${RESET}`, width));

			// Puntero
			lines.push(center(`       ${fg256(220)}${BOLD}▼${RESET}`, width));

			// Ruleta
			for (const rl of ruletaLines) {
				lines.push(center(rl, width));
			}

			// Info según la fase
			if (anim.phase === "spin") {
				const t = Math.min(1, (performance.now() - anim.phaseStart) / SPIN_DURATION);
				const segs = Math.floor(t * 16);
				const barra = `${fg256(214)}${"▓".repeat(segs)}${"░".repeat(16 - segs)}${RESET}`;
				lines.push(center(`${dim("girando...")}  ${barra}`, width));
			} else if (anim.premioIdx >= 0) {
				const p = PREMIOS[anim.premioIdx];
				const raro = p.raro ? `  ${BOLD}${fg256(220)}✦ RARO ✦${RESET}` : "";
				lines.push(center(`${p.emoji} ${BOLD}${p.nombre}${RESET}  ${dim("—")}  ${p.descripcion}${raro}`, width));
			} else {
				lines.push(center(dim(anim.ultimoTexto), width));
			}

			// Stats + barra
			const textoCorto = anim.ultimoTexto.length > 40
				? anim.ultimoTexto.slice(0, 37) + "…"
				: anim.ultimoTexto;

			// Indicador de tema (si está disponible y hay tema actual conocido)
			let temaTxt = "";
			if (themeState.disponible) {
				if (themeState.temaPendiente) {
					temaTxt = `  ${dim("·")}  ${dim("tema:")} ${themeState.actual || "?"} ${fg256(220)}${BOLD}→${RESET} ${BOLD}${themeState.temaPendiente}${RESET}`;
				} else if (themeState.actual) {
					temaTxt = `  ${dim("·")}  ${dim("tema:")} ${themeState.actual}`;
				}
			}

			const statsTxt = `${dim("total:")} ${BOLD}${stats.total}${RESET} ${dim("giros")}` +
				(anim.ultimoTexto && anim.premioIdx >= 0 ? `  ${dim("·")}  ${dim("último:")} ${textoCorto}` : "") +
				temaTxt;

			if (anim.phase === "reveal") {
				const t = Math.min(1, (performance.now() - anim.phaseStart) / REVEAL_DURATION);
				const segs = Math.floor(t * 16);
				const barra = `${fg256(42)}${"▓".repeat(segs)}${"░".repeat(16 - segs)}${RESET}`;
				lines.push(center(`${barra}  ${statsTxt}`, width));
			} else {
				lines.push(center(statsTxt, width));
			}

			// Red de seguridad final: truncar cada línea al ancho disponible.
			// Evita que nombres de tema largos, emojis anchos o descripciones
			// extensas rompan el invariante de pi (toda línea <= width).
			return lines.map((l) => truncateToWidth(l, width));
		},
	};
}

// ============================================================
//  Extensión
// ============================================================
export default function (pi: ExtensionAPI) {
	// `setFooter` lives on `ctx.ui`, but `session_shutdown` doesn't receive ctx,
	// so we capture the active context here to clean up the footer on shutdown.
	let activeCtx: { ui: { setFooter: (cb: unknown) => void } } | null = null;

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		activeCtx = ctx;
		ctx.ui.setFooter(makeFooter);
		// Detectar omarchy en segundo plano para tener el tema listo en el primer giro
		initOmarchy().catch(() => {});
	});

	pi.on("session_shutdown", async () => {
		activeCtx?.ui.setFooter(undefined);
		activeCtx = null;
	});

	pi.registerCommand("ruleta", {
		description: "Gira la ruleta de premios manualmente",
		handler: async (args, ctx) => {
			const texto = args.trim() || "girada manual";
			startSpin(elegirPremio(), texto);
			if (themeAuto) cambiarTemaAleatorio().catch(() => {});
			ctx.ui.notify("🎰 Girando...", "info");
		},
	});

	pi.registerCommand("ruleta-stats", {
		description: "Muestra las estadísticas de la ruleta",
		handler: async (_args, ctx) => {
			const lineas: string[] = [];
			lineas.push(`${BOLD}📊 Estadísticas de la ruleta${RESET}`);
			lineas.push(`Total de giros: ${stats.total}`);
			lineas.push("");
			PREMIOS.forEach((p, i) => {
				const c = stats.contadores[i] || 0;
				const pct = stats.total > 0 ? ((c / stats.total) * 100).toFixed(1) : "0.0";
				const barra = "█".repeat(Math.min(20, Math.round((c / Math.max(1, stats.total)) * 20)));
				lineas.push(`${p.emoji} ${p.nombre.padEnd(12)} ${String(c).padStart(4)} (${pct.padStart(5)}%) ${DIM}${barra}${RESET}`);
			});
			ctx.ui.notify(lineas.join("\n"), "info");
		},
	});

	pi.registerCommand("ruleta-toggle", {
		description: "Activa o desactiva el giro automático al enviar texto",
		handler: async (_args, ctx) => {
			spinAuto = !spinAuto;
			ctx.ui.notify(
				`Giro automático: ${spinAuto ? "ACTIVADO 🎰" : "DESACTIVADO ⏸"}`,
				spinAuto ? "info" : "warning",
			);
		},
	});

	pi.registerCommand("ruleta-theme-toggle", {
		description: "Activa o desactiva el cambio de tema de Omarchy con cada giro",
		handler: async (_args, ctx) => {
			themeAuto = !themeAuto;
			ctx.ui.notify(
				`Cambio de tema: ${themeAuto ? "ACTIVADO 🎨" : "DESACTIVADO ⏸"}`,
				themeAuto ? "info" : "warning",
			);
		},
	});

	pi.registerCommand("ruleta-reset", {
		description: "Resetea las estadísticas de la ruleta",
		handler: async (_args, ctx) => {
			stats = { contadores: {}, total: 0 };
			guardarStats(stats);
			ctx.ui.notify("Estadísticas reseteadas 🗑", "info");
		},
	});

	// Hook principal: cada vez que el usuario envía texto, gira la ruleta
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };
		if (event.text.startsWith("/")) return { action: "continue" };
		if (!spinAuto) return { action: "continue" };

		const texto = event.text.length > 40 ? event.text.slice(0, 37) + "…" : event.text;
		startSpin(elegirPremio(), texto);
		if (themeAuto) cambiarTemaAleatorio().catch(() => {});
		return { action: "continue" };
	});
}