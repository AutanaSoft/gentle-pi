import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { GAUGE_CELLS, gaugeTone, paintGauge, renderGauge, type GaugeTone } from "./shell-gauge.ts";
import { renderUsageBar, type ProviderUsage } from "./shell-usage.ts";
import { sanitizeTerminalText } from "./terminal-theme.ts";
import { CARD_TONE, cardInnerWidth, renderCard } from "./shell-card.ts";

export { gaugeTone, renderGauge, type GaugeTone };

// Gentle Shell status bar: a responsive one-to-three-line replacement for
// pi's built-in footer. Everything here is pure so it can be verified without
// a live TUI.

export interface ShellBarModel {
	cwd: string;
	branch: string | null;
	dirty: number | undefined;
	sessionName: string | undefined;
	modelId: string;
	effort: string | undefined;
	contextPercent: number | null;
	contextWindow: number;
	costTotal: number;
	subscription: boolean;
	usage: ProviderUsage | undefined;
	statuses: string[];
}

export interface ShellBarTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

// Theme roles the bar paints with. Keys are pi theme colors; the Gentle themes
// map them to the rose palette (accent = rose, syntaxFunction = powder blue).
const ROLE = {
	BRAND: "accent",
	SEPARATOR: "dim",
	PATH: "muted",
	BRANCH: "text",
	DIRTY: "warning",
	MODEL: "text",
	EFFORT: "syntaxFunction",
	LABEL: "muted",
	VALUE: "text",
	STATUS: "muted",
	SESSION: "dim",
} as const;

export const SHELL_BAR_BRAND = "✿ gentle-pi";
export const SHELL_BAR_SEPARATOR = "⟡";
export const SHELL_BAR_GAUGE_CELLS = GAUGE_CELLS;
const RIGHT_PADDING = 2;
const COMPACT_BRANCH_WIDTH = 15;

export function shellEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.GENTLE_PI_AGENTS_CHILD === "1") return false;
	const value = env.GENTLE_PI_SHELL?.trim().toLowerCase();
	return !(value === "0" || value === "false" || value === "off");
}

export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

export function formatCost(total: number, subscription: boolean): string {
	const amount = total >= 1 ? total.toFixed(2) : total.toFixed(3);
	return subscription ? `$${amount} sub` : `$${amount}`;
}

// External values may contain terminal control sequences or line breaks. Keep
// each field to one safe display line before applying the bar's own palette.
function sanitizeBarText(text: string): string {
	return sanitizeTerminalText(text.replace(/[\r\n\t]/g, " ")).replace(/ +/g, " ").trim();
}

interface ShellBarFields {
	brand: string;
	project: string;
	compactProject: string;
	model: string;
	compactModel: string;
	context: string[];
	cost: string;
	usage?: [full: string, compact: string, percentOnly: string];
	statuses: string[];
	session?: string;
}

function clipText(text: string, max: number): string {
	if (visibleWidth(text) <= max) return text;
	if (max <= 1) return "…";
	let clipped = "";
	for (const char of text) {
		if (visibleWidth(clipped + char) > max - 1) break;
		clipped += char;
	}
	return `${clipped}…`;
}

function joinSegments(segments: string[], theme: ShellBarTheme): string {
	return segments.filter(Boolean).join(` ${theme.fg(ROLE.SEPARATOR, SHELL_BAR_SEPARATOR)} `);
}

function buildFields(model: ShellBarModel, theme: ShellBarTheme): ShellBarFields {
	const projectCwd = sanitizeBarText(model.cwd);
	const projectBranch = model.branch ? sanitizeBarText(model.branch) : null;
	const modelId = sanitizeBarText(model.modelId);
	const effort = model.effort ? sanitizeBarText(model.effort) : undefined;
	const sessionName = model.sessionName ? sanitizeBarText(model.sessionName) : undefined;
	const project = (cwd: string, branch: string | null) => {
		const dirty = model.dirty ? ` ${theme.fg(ROLE.DIRTY, `±${model.dirty}`)}` : "";
		return branch ? `${theme.fg(ROLE.PATH, cwd)} ${theme.fg(ROLE.BRANCH, branch)}${dirty}` : theme.fg(ROLE.PATH, cwd) + dirty;
	};
	const cwd = projectCwd.split("/").filter(Boolean).pop() ?? projectCwd;
	const branch = projectBranch && visibleWidth(projectBranch) > COMPACT_BRANCH_WIDTH ? clipText(projectBranch, COMPACT_BRANCH_WIDTH) : projectBranch;
	const percent = model.contextPercent === null ? "?%" : `${Math.round(model.contextPercent)}%`;
	const context = (cells?: number) => `${theme.fg(ROLE.LABEL, "ctx")}${cells ? ` ${paintGauge(model.contextPercent, theme, cells)}` : ""} ${theme.fg(ROLE.VALUE, percent)}`;
	const main = model.usage?.limits[0];
	const [firstWindow, ...otherWindows] = main?.windows ?? [];
	const usage = main && firstWindow
		? ([5, 2, undefined] as const).map((cells) => {
			const gauge = cells ? ` ${paintGauge(firstWindow.usedPercent, theme, cells)}` : "";
			const head = `${theme.fg(ROLE.LABEL, main.name)} ${theme.fg(ROLE.LABEL, firstWindow.label)}${gauge} ${theme.fg(ROLE.VALUE, `${Math.round(firstWindow.usedPercent)}%`)}`;
			const tail = otherWindows.map((window) => `${theme.fg(ROLE.SEPARATOR, "·")} ${theme.fg(ROLE.LABEL, window.label)} ${theme.fg(ROLE.VALUE, `${Math.round(window.usedPercent)}%`)}`);
			return [head, ...tail].join(" ");
		}) as [string, string, string]
		: undefined;
	return {
		brand: theme.fg(ROLE.BRAND, SHELL_BAR_BRAND),
		project: project(cwd, projectBranch),
		compactProject: project(cwd, branch),
		model: effort ? `${theme.fg(ROLE.MODEL, modelId)} ${theme.fg(ROLE.LABEL, "·")} ${theme.fg(ROLE.EFFORT, effort)}` : theme.fg(ROLE.MODEL, modelId),
		compactModel: theme.fg(ROLE.MODEL, modelId),
		context: [context(5), context(2), context()],
		cost: theme.fg(ROLE.VALUE, formatCost(model.costTotal, model.subscription)),
		usage,
		statuses: model.statuses.map(sanitizeBarText).filter(Boolean).map((status) => theme.fg(ROLE.STATUS, status)),
		session: sessionName ? theme.fg(ROLE.SESSION, sessionName) : undefined,
	};
}

function fitLine(line: string, width: number): string {
	return visibleWidth(line) <= width ? line : truncateToWidth(line, width, "…");
}

function projectLine(fields: ShellBarFields, theme: ShellBarTheme, width: number): string {
	const left = [fields.project, fields.compactProject].find((candidate) => visibleWidth(joinSegments([fields.brand, candidate], theme)) <= width);
	const identity = joinSegments([fields.brand, left ?? fields.compactProject], theme);
	if (!fields.session || visibleWidth(identity) + RIGHT_PADDING >= width) return fitLine(identity, width);
	const sessionWidth = width - visibleWidth(identity) - RIGHT_PADDING;
	const session = fitLine(fields.session, sessionWidth);
	return `${identity}${" ".repeat(Math.max(RIGHT_PADDING, width - visibleWidth(identity) - visibleWidth(session)))}${session}`;
}

function runtimeLine(fields: ShellBarFields, theme: ShellBarTheme, width: number, includeUsage: boolean): { line: string; includesUsage: boolean } {
	const candidates = includeUsage && fields.usage
		? [
			{ context: fields.context[0], usage: fields.usage[0] },
			{ context: fields.context[0], usage: fields.usage[1] },
			{ context: fields.context[0], usage: fields.usage[2] },
			{ context: fields.context[1], usage: fields.usage[2] },
			{ context: fields.context[2], usage: fields.usage[2] },
		]
		: fields.context.map((context) => ({ context, usage: undefined }));
	for (const model of [fields.model, fields.compactModel]) {
		for (const candidate of candidates) {
			const line = joinSegments([model, candidate.context, fields.cost, candidate.usage ?? ""], theme);
			if (visibleWidth(line) <= width) return { line, includesUsage: Boolean(candidate.usage) };
		}
	}
	return { line: fitLine(joinSegments([fields.compactModel, fields.context[2]], theme), width), includesUsage: false };
}

function statusLine(fields: ShellBarFields, theme: ShellBarTheme, width: number): string {
	for (let count = fields.statuses.length; count >= 0; count--) {
		const omitted = fields.statuses.length - count;
		const indicator = omitted ? theme.fg(ROLE.STATUS, count ? `+${omitted} more` : `+${omitted} integrations`) : "";
		const line = joinSegments([...fields.statuses.slice(0, count), indicator], theme);
		if (visibleWidth(line) <= width) return line;
	}
	return fitLine(joinSegments([theme.fg(ROLE.STATUS, `+${fields.statuses.length} integrations`)], theme), width);
}

// Sidebar groups use structured fields, never positional compact-bar segments
// or inferred meanings from opaque extension status strings.
export function renderShellSidebarBar(model: ShellBarModel, theme: ShellBarTheme, width: number): string[] {
	const value = (text: string) => theme.fg(ROLE.VALUE, theme.bold(text));
	const label = (text: string) => theme.fg(ROLE.LABEL, text);
	const dirty = model.dirty ? theme.fg(ROLE.DIRTY, `±${model.dirty}`) : "";
	const cwd = sanitizeBarText(model.cwd);
	const branchName = model.branch ? sanitizeBarText(model.branch) : "";
	const modelId = sanitizeBarText(model.modelId);
	const effort = model.effort ? sanitizeBarText(model.effort) : "";
	const sessionName = model.sessionName ? sanitizeBarText(model.sessionName) : "";
	const branch = branchName ? `${label("Branch")} ${value(branchName)}` : "";
	const percent = model.contextPercent === null ? "?%" : `${Math.round(model.contextPercent)}%`;
	const capacity = label(`${formatTokens(model.contextWindow)} tokens`);
	const usage = model.usage ? renderUsageBar(model.usage, theme) : undefined;
	const groups: Array<{ title: string; lines: string[] }> = [
		{
			title: "Project",
			lines: [
				value(cwd),
				...((branch || dirty) ? [[branch, dirty].filter(Boolean).join(" ")] : []),
				...(sessionName ? [`${label("Session")} ${value(sessionName)}`] : []),
			],
		},
		{
			title: "Model",
			lines: [value(modelId), ...(effort ? [`${label("Effort")} ${theme.fg(ROLE.EFFORT, effort)}`] : [])],
		},
		{
			title: "Context",
			lines: [`${paintGauge(model.contextPercent, theme)} ${value(percent)}  ${capacity}`],
		},
		{
			title: "Usage",
			lines: [`${label("Cost")} ${value(formatCost(model.costTotal, model.subscription))}`, ...(usage ? [usage] : [])],
		},
		...(model.statuses.length ? [{ title: "Integrations", lines: model.statuses.map(sanitizeBarText).filter(Boolean).map((status) => theme.fg(ROLE.STATUS, status)) }] : []),
	];
	// Pre-wrap values before indenting so Unicode/ANSI continuation lines keep
	// the same inset without consuming the card's right border.
	const innerWidth = cardInnerWidth(width);
	const inset = Math.min(1, innerWidth - 1);
	const body = groups.flatMap((group, index) => [
		...(index ? [""] : []),
		label(group.title),
		...group.lines.flatMap((line) => wrapTextWithAnsi(line, innerWidth - inset).map((part) => " ".repeat(inset) + part)),
	]);
	return renderCard({ title: "Status", body, tone: CARD_TONE.INFO }, theme, width, { expanded: true });
}

export function renderShellBar(model: ShellBarModel, theme: ShellBarTheme, width: number): string[] {
	const fields = buildFields(model, theme);
	const complete = joinSegments([fields.brand, fields.project, fields.model, fields.context[0], fields.cost, fields.usage?.[0] ?? "", ...fields.statuses], theme);
	if (visibleWidth(complete) + (fields.session ? RIGHT_PADDING + visibleWidth(fields.session) : 0) <= width) {
		const padding = fields.session ? " ".repeat(width - visibleWidth(complete) - visibleWidth(fields.session)) : "";
		return [complete + padding + (fields.session ?? "")];
	}

	const first = projectLine(fields, theme, width);
	const secondWithUsage = runtimeLine(fields, theme, width, true);
	if (fields.statuses.length === 0 && (!fields.usage || secondWithUsage.includesUsage)) return [first, secondWithUsage.line];

	const second = secondWithUsage.includesUsage ? secondWithUsage : runtimeLine(fields, theme, width, false);
	return [first, second.line, statusLine(fields, theme, width)].map((line) => fitLine(line, width));
}
