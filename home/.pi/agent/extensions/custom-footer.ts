/**
 * Custom footer for pi: replaces the default stats row.
 *
 * Default stats row showed: ↑in ↓out RcacheRead WcacheWrite CH<hit%> $cost <pct>%/<window>
 * This footer shows, left side:  ctx <tokens>/<window> · <pct>% · $<cost>
 * Right side and the cwd/session line are identical to the built-in footer.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const dispose = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose,
				invalidate() {},
				render(width: number): string[] {
					// --- session cost totals (assistant + tool results + compaction/branch) ---
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

					// --- left stats: context tokens, percent, dollars ---
					const dim = (s: string) => theme.fg("dim", s);
					const percentColored =
						percent != null && percent > 90
							? theme.fg("error", percentStr)
							: percent != null && percent > 70
								? theme.fg("warning", percentStr)
								: dim(percentStr);
					const statsLeft = [
						dim(`ctx ${tokensStr}/${windowStr}`),
						percentColored,
						dim(`$${cost.toFixed(3)}`),
					].join(" \u00b7 ");

					// --- right side: model / provider / thinking (same as default) ---
					const modelName = ctx.model?.id || "no-model";
					let rightSideWithoutProvider = modelName;
					if (ctx.model?.reasoning) {
						const thinkingLevel = ctx.thinkingLevel || "off";
						rightSideWithoutProvider =
							thinkingLevel === "off" ? `${modelName} \u00b7 thinking off` : `${modelName} \u00b7 ${thinkingLevel}`;
					}
					let rightSide = rightSideWithoutProvider;
					const providerCount = (footerData as any).getAvailableProviderCount?.() ?? 1;
					if (providerCount > 1 && ctx.model) {
						const prefixed = `(${ctx.model.provider}) ${rightSideWithoutProvider}`;
						if (visibleWidth(statsLeft) + 2 + visibleWidth(prefixed) <= width) {
							rightSide = prefixed;
						}
					}

					// --- join left/right on one padded line ---
					const statsLeftWidth = visibleWidth(statsLeft);
					const padding = " ".repeat(Math.max(1, width - statsLeftWidth - visibleWidth(rightSide)));
					const statsLine = truncateToWidth(`${statsLeft}${padding}${rightSide}`, width);

					// --- top line: cwd (git branch) (session name), same as default ---
					let pwd = formatCwdForFooter(ctx.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
					const branch = footerData.getGitBranch();
					if (branch) pwd = `${pwd} (${branch})`;
					const sessionName = (ctx.sessionManager as any).getSessionName?.();
					if (sessionName) pwd = `${pwd} \u00b7 ${sessionName}`;

					const lines = [truncateToWidth(dim(pwd), width, dim("...")), dim(statsLine)];

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
		});
	});
}
