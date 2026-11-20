/**
 * Cow Footer Extension
 *
 * Replaces the footer with an ASCII cow that walks across the bottom line,
 * saying "muu!" every 2 seconds.
 *
 * - Auto-registers on `session_start`.
 * - Use `/cow` to toggle on/off (off restores whatever footer was set previously).
 *
 * NOTE: This extension uses `ctx.ui.setFooter()`. If you also have another
 * extension that registers a footer (e.g. custom-footer.ts), whichever runs
 * last wins. Disable one of them with its toggle command or comment it out.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// Two-frame walking animation of a cow, rendered as a single horizontal line.
// Based on the classic cowsay shape with the legs alternating each frame.
const COW_FRAMES = [
	// Frame 1 — front leg forward, back leg planted
	"\\   ^__^ \\  (oo)\\_______  (__ )    ||      ||----w |   ||     ||",
	// Frame 2 — both legs in motion
	"\\   ^__^ \\  (oo)\\_______  (__ )    ww      ||---w  |   ||     ||",
];

const MUU_INTERVAL_MS = 2000; // a "muu!" every 2 seconds
const MUU_DURATION_MS = 900; // how long the "muu!" stays visible
const ANIM_TICK_MS = 100; // timer resolution (10 fps)
const FRAME_MS = 250; // leg animation cadence
const CYCLE_SECONDS = 14; // seconds for the cow to cross the footer in one direction

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 1e4) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1e6) return `${Math.round(count / 1000)}k`;
	if (count < 1e7) return `${(count / 1e6).toFixed(1)}M`;
	return `${Math.round(count / 1e6)}M`;
}

function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	if (cwd === home) return "~";
	if (cwd.startsWith(`${home}/`) || cwd.startsWith(`${home}\\`)) return `~${cwd.slice(home.length)}`;
	return cwd;
}

function createCowComponent(
	tui: { requestRender: () => void },
	theme: { fg: (color: string, text: string) => string },
	footerData: {
		onBranchChange: (cb: () => void) => () => void;
		getGitBranch: () => string | undefined;
		getExtensionStatuses: () => Map<string, string>;
	},
	ctx: {
		sessionManager: {
			getCwd: () => string;
			getEntries: () => unknown[];
			getSessionName?: () => string | undefined;
		};
		getContextUsage: () => { tokens: number; percent: number; contextWindow: number } | undefined;
		model?: { contextWindow?: number };
	},
) {
	const startTime = Date.now();
	let frame = 0;
	let lastMuuAt = startTime - MUU_INTERVAL_MS; // schedule the first "muu!" right after start
	let muuShownAt = 0;
	let muuVisible = false;

	const unsub = footerData.onBranchChange(() => tui.requestRender());

	const interval = setInterval(() => {
		const now = Date.now();
		frame = Math.floor(((now - startTime) / FRAME_MS) % COW_FRAMES.length);

		if (!muuVisible && now - lastMuuAt >= MUU_INTERVAL_MS) {
			muuVisible = true;
			muuShownAt = now;
			lastMuuAt = now;
		}
		if (muuVisible && now - muuShownAt >= MUU_DURATION_MS) {
			muuVisible = false;
		}

		tui.requestRender();
	}, ANIM_TICK_MS);

	return {
		dispose() {
			unsub();
			clearInterval(interval);
		},
		invalidate() {},
		render(width: number): string[] {
			const dim = (s: string) => theme.fg("dim", s);

			// --- session cost totals ---
			let cost = 0;
			for (const entry of ctx.sessionManager.getEntries() as any[]) {
				if (entry.type === "message" && entry.message) {
					const role = entry.message.role;
					if (role === "assistant" || (role === "toolResult" && entry.message.usage)) {
						cost += entry.message.usage?.cost?.total ?? 0;
					}
				} else if (entry.type === "branch_summary" || entry.type === "compaction") {
					cost += entry.usage?.cost?.total ?? 0;
				}
			}

			// --- context usage ---
			const usage = ctx.getContextUsage();
			const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
			const tokensStr = usage?.tokens != null ? formatTokens(usage.tokens) : "?";
			const windowStr = contextWindow > 0 ? formatTokens(contextWindow) : "?";
			const percent = usage?.percent ?? null;
			const percentStr = percent != null ? `${percent.toFixed(1)}%` : "?";
			const percentColored =
				percent != null && percent > 90
					? theme.fg("error", percentStr)
					: percent != null && percent > 70
						? theme.fg("warning", percentStr)
						: dim(percentStr);

			// --- top line: cwd (branch) · session name (left) + stats (right) ---
			let pwd = formatCwdForFooter(ctx.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
			const branch = footerData.getGitBranch();
			if (branch) pwd = `${pwd} (${branch})`;
			const sessionName = ctx.sessionManager.getSessionName?.();
			if (sessionName) pwd = `${pwd} · ${sessionName}`;

			const statsRight = dim(`${tokensStr}/${windowStr} · `) + percentColored + dim(` · $${cost.toFixed(3)}`);
			const statsRightWidth = visibleWidth(statsRight);
			const pwdLineRaw = dim(pwd);
			const pwdWidth = visibleWidth(pwdLineRaw);
			const topPad = " ".repeat(Math.max(1, width - pwdWidth - statsRightWidth));
			const pwdLine = truncateToWidth(pwdLineRaw + topPad + statsRight, width);

			// --- cow line: ping-pong motion + muu! near the head ---
			const cowLine = COW_FRAMES[frame];
			const cowWidth = visibleWidth(cowLine);

			const muuText = muuVisible ? ` ${theme.fg("warning", "muu!")} ` : "";
			const muuWidth = visibleWidth(muuText);

			let cowRow: string;
			if (width >= cowWidth + muuWidth + 1) {
				const t = (Date.now() - startTime) / 1000;
				const cycle = CYCLE_SECONDS;
				const phase = (t % cycle) / cycle; // 0..1
				const direction = Math.floor(t / cycle) % 2 === 0 ? 1 : -1;
				const availableWidth = Math.max(1, width - cowWidth - muuWidth);

				const cowX = direction === 1
					? Math.round(phase * availableWidth)
					: Math.round((1 - phase) * availableWidth);

				if (direction === 1) {
					// Moving right: muu ahead of the head
					cowRow =
						" ".repeat(cowX) +
						muuText +
						cowLine +
						" ".repeat(Math.max(0, width - cowX - muuWidth - cowWidth));
				} else {
					// Moving left: muu behind the tail
					cowRow =
						" ".repeat(cowX) +
						cowLine +
						muuText +
						" ".repeat(Math.max(0, width - cowX - cowWidth - muuWidth));
				}
				cowRow = truncateToWidth(cowRow, width);
			} else {
				// Footer too narrow for the cow — fall back to just the muu
				cowRow = truncateToWidth(muuText || dim("(no cow — terminal too narrow)") + "", width);
			}

			const lines = [pwdLine, cowRow];

			// --- extension status line (kept from default) ---
			const statuses = footerData.getExtensionStatuses();
			if (statuses.size > 0) {
				const statusLine = Array.from(statuses.values())
					.sort((a, b) => a.localeCompare(b))
					.join(" ");
				lines.push(truncateToWidth(statusLine, width, dim("...")));
			}

			return lines;
		},
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("cow", {
		description: "Toggle ASCII cow walking across the footer (says muu! every 2s)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Cow footer requires interactive mode", "error");
				return;
			}

			// Toggle: if a footer is currently set, remove it (set to undefined).
			// If none is set, install the cow footer.
			// We track state locally so multiple /cow invocations behave intuitively.
			const state = (pi as unknown as { _cowState?: { enabled: boolean } })._cowState ?? { enabled: false };
			(pi as unknown as { _cowState?: { enabled: boolean } })._cowState = state;

			state.enabled = !state.enabled;
			if (state.enabled) {
				ctx.ui.setFooter((tui, theme, footerData) => createCowComponent(tui, theme, footerData, ctx));
				ctx.ui.notify("🐄 Cow footer enabled", "info");
			} else {
				ctx.ui.setFooter(undefined);
				ctx.ui.notify("Cow footer disabled", "info");
			}
		},
	});

	// Auto-register on session_start so the user gets a cow immediately.
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const state = (pi as unknown as { _cowState?: { enabled: boolean } })._cowState ?? { enabled: true };
		(pi as unknown as { _cowState?: { enabled: boolean } })._cowState = state;
		if (!state.enabled) return;
		ctx.ui.setFooter((tui, theme, footerData) => createCowComponent(tui, theme, footerData, ctx));
	});
}