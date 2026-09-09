import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	formatCost,
	formatTokens,
	gaugeTone,
	renderGauge,
	renderShellBar,
	shellEnabled,
	type ShellBarModel,
	type ShellBarTheme,
} from "../lib/shell-bar.ts";

// The Gentle Shell bar replaces pi's three-line footer with a responsive
// one-to-three-line layout. Rendering is pure so it can be verified without a TUI.

const taggedTheme: ShellBarTheme = {
	fg(color: string, value: string) {
		return `<${color}>${value}</${color}>`;
	},
	bold(value: string) {
		return value;
	},
};

const plainTheme: ShellBarTheme = {
	fg(_color: string, value: string) {
		return value;
	},
	bold(value: string) {
		return value;
	},
};

function model(overrides: Partial<ShellBarModel> = {}): ShellBarModel {
	return {
		cwd: "~/work/gentle-pi",
		branch: "main",
		dirty: undefined,
		sessionName: undefined,
		modelId: "gpt-5.5",
		effort: "medium",
		contextPercent: 45,
		contextWindow: 272_000,
		costTotal: 9.49,
		subscription: true,
		usage: undefined,
		statuses: [],
		...overrides,
	};
}

test("renderGauge fills cells proportionally to the percentage", () => {
	assert.equal(renderGauge(45, 8), "▰▰▰▰▱▱▱▱");
	assert.equal(renderGauge(0, 8), "▱▱▱▱▱▱▱▱");
	assert.equal(renderGauge(100, 8), "▰▰▰▰▰▰▰▰");
	assert.equal(renderGauge(null, 8), "▱▱▱▱▱▱▱▱");
});

test("gaugeTone turns to warning at 80% and error at 95%", () => {
	assert.equal(gaugeTone(45), "accent");
	assert.equal(gaugeTone(79.9), "accent");
	assert.equal(gaugeTone(80), "warning");
	assert.equal(gaugeTone(95), "error");
	assert.equal(gaugeTone(null), "dim");
});

test("formatTokens and formatCost keep the bar compact", () => {
	assert.equal(formatTokens(950), "950");
	assert.equal(formatTokens(4_200), "4.2k");
	assert.equal(formatTokens(272_000), "272k");
	assert.equal(formatTokens(13_000_000), "13M");
	assert.equal(formatCost(9.49, true), "$9.49 sub");
	assert.equal(formatCost(0.004, false), "$0.004");
});

test("renderShellBar renders one line with the segments in order", () => {
	const [line, ...rest] = renderShellBar(model(), plainTheme, 160);
	assert.equal(rest.length, 0);
	assert.equal(
		line,
		"✿ gentle-pi ⟡ gentle-pi main ⟡ gpt-5.5 · medium ⟡ ctx ▰▰▱▱▱ 45% ⟡ $9.49 sub",
	);
});

test("renderShellBar uses five-cell gauges in its full presentation", () => {
	const usage = {
		provider: "openai-codex",
		plan: "pro",
		fetchedAt: 0,
		limits: [{ name: "codex", limitReached: false, windows: [{ label: "5h", usedPercent: 62, windowSeconds: 18_000, resetAt: null }] }],
	};
	const [line] = renderShellBar(model({ usage }), plainTheme, 200);
	assert.match(line, /ctx ▰▰▱▱▱ 45%/);
	assert.match(line, /codex 5h ▰▰▰▱▱ 62%$/);
});

test("renderShellBar degrades usage before context from five cells to two cells to percentage-only", () => {
	const usage = {
		provider: "openai-codex",
		plan: "pro",
		fetchedAt: 0,
		limits: [{ name: "codex", limitReached: false, windows: [{ label: "5h", usedPercent: 62, windowSeconds: 18_000, resetAt: null }] }],
	};
	const runtime = (width: number) => renderShellBar(model({ usage, statuses: ["MCP ready"] }), plainTheme, width)[1];
	assert.match(runtime(62), /ctx ▰▰▱▱▱ 45% ⟡ \$9\.49 sub ⟡ codex 5h ▰▱ 62%$/);
	assert.match(runtime(59), /ctx ▰▰▱▱▱ 45% ⟡ \$9\.49 sub ⟡ codex 5h 62%$/);
	assert.match(runtime(56), /ctx ▰▱ 45% ⟡ \$9\.49 sub ⟡ codex 5h 62%$/);
});

test("renderShellBar reflows complete content into semantic lines before omitting it", () => {
	const usage = {
		provider: "openai-codex",
		plan: "pro",
		fetchedAt: 0,
		limits: [{ name: "codex", limitReached: false, windows: [{ label: "5h", usedPercent: 62, windowSeconds: 18_000, resetAt: null }] }],
	};
	const intermediate = renderShellBar(model({ sessionName: "Release notes" }), plainTheme, 80);
	assert.equal(intermediate.length, 2);
	assert.match(intermediate[0], /Release notes$/);
	assert.match(intermediate[1], /gpt-5\.5/);

	const withUsage = renderShellBar(model({ usage }), plainTheme, 80);
	assert.equal(withUsage.length, 2);
	assert.match(withUsage[1], /codex 5h/);

	const narrow = renderShellBar(model({ usage, statuses: ["MCP: 3/3", "Engram ready"] }), plainTheme, 55);
	assert.equal(narrow.length, 3);
	assert.doesNotMatch(narrow[2], /codex 5h/);
	assert.match(narrow[2], /MCP: 3\/3|Engram ready|\+\d+ integrations/);
	for (const line of [...intermediate, ...withUsage]) assert.ok(visibleWidth(line) <= 80);
	for (const line of narrow) assert.ok(visibleWidth(line) <= 55);
});

test("renderShellBar colors the brand, model, effort, and gauge by role", () => {
	const [line] = renderShellBar(model(), taggedTheme, 400);
	assert.match(line, /<accent>✿ gentle-pi<\/accent>/);
	assert.match(line, /<text>gpt-5\.5<\/text>/);
	assert.match(line, /<syntaxFunction>medium<\/syntaxFunction>/);
	assert.match(line, /<accent>▰▰<\/accent><border>▱▱▱<\/border>/);
	assert.match(line, /<dim>⟡<\/dim>/);
});

test("renderShellBar shows the branch as dirty-neutral and omits it outside git", () => {
	const [line] = renderShellBar(model({ branch: null }), plainTheme, 160);
	assert.match(line, /⟡ gentle-pi ⟡/);
});

test("renderShellBar shows the session dirty count next to the branch", () => {
	const [line] = renderShellBar(model({ dirty: 3 }), taggedTheme, 400);
	assert.match(line, /<text>main<\/text> <warning>±3<\/warning>/);
	const [clean] = renderShellBar(model({ dirty: 0 }), plainTheme, 160);
	assert.doesNotMatch(clean, /±/);
});

test("renderShellBar adds the subscription windows after the cost when usage is known", () => {
	const usage = {
		provider: "openai-codex",
		plan: "pro",
		fetchedAt: 0,
		limits: [{ name: "codex", limitReached: false, windows: [
			{ label: "5h", usedPercent: 62, windowSeconds: 18_000, resetAt: null },
			{ label: "week", usedPercent: 31, windowSeconds: 604_800, resetAt: null },
		] }],
	};
	const [line] = renderShellBar(model({ usage }), plainTheme, 200);
	assert.match(line, /\$9\.49 sub ⟡ codex 5h ▰▰▰▱▱ 62% · week 31%$/);
});

test("renderShellBar shows an unknown context as a question mark after compaction", () => {
	const [line] = renderShellBar(model({ contextPercent: null }), plainTheme, 160);
	assert.match(line, /ctx ▱▱▱▱▱ \?%/);
});

test("renderShellBar right-aligns the session name when it fits", () => {
	const [line] = renderShellBar(model({ sessionName: "Release notes" }), plainTheme, 120);
	assert.equal(visibleWidth(line), 120);
	assert.match(line, /Release notes$/);
});

test("renderShellBar appends extension statuses as trailing segments", () => {
	const [line] = renderShellBar(model({ statuses: ["🔌 MCP: 3 servers\tenabled"] }), plainTheme, 160);
	assert.match(line, /⟡ 🔌 MCP: 3 servers enabled$/);
});

test("renderShellBar repaints extension statuses in the bar role, discarding colors the extension embedded", () => {
	const tagged = { fg: (color: string, text: string) => `<${color}>${text}</${color}>`, bold: (text: string) => text };
	const [line] = renderShellBar(model({ statuses: ["\x1b[38;2;255;0;0mMCP: 3/3 servers\x1b[0m"] }), tagged, 400);
	assert.match(line, /<muted>MCP: 3\/3 servers<\/muted>$/);
	assert.doesNotMatch(line, /\x1b\[/);
});

test("renderShellBar preserves the project identity before it sacrifices an extension status", () => {
	const long = model({ branch: "fix/shell-bar-status-ansi", dirty: 2, statuses: ["MCP: 3/3 servers"] });
	const [full] = renderShellBar(long, plainTheme, 160);
	assert.match(full, /gentle-pi fix\/shell-bar-status-ansi ±2 .* MCP: 3\/3 servers$/);
	const compact = renderShellBar(long, plainTheme, 90);
	for (const line of compact) assert.ok(visibleWidth(line) <= 90, `line overflowed: ${visibleWidth(line)}`);
	assert.match(compact[0], /✿ gentle-pi ⟡ gentle-pi fix\/shell-bar-status-ansi ±2$/);
	assert.match(compact.join("\n"), /MCP: 3\/3 servers/);
});

test("renderShellBar keeps provider usage on line two and statuses on line three", () => {
	const usage = {
		provider: "openai-codex",
		plan: "pro",
		fetchedAt: 0,
		limits: [{ name: "codex", limitReached: false, windows: [{ label: "week", usedPercent: 4, windowSeconds: 604_800, resetAt: null }] }],
	};
	const lines = renderShellBar(model({ usage, statuses: ["MCP: 3 servers enabled", "Engram ready"] }), plainTheme, 80);
	assert.equal(lines.length, 3);
	assert.match(lines[1], /\$9\.49 sub ⟡ codex week/);
	assert.match(lines[2], /MCP: 3 servers enabled|Engram ready|\+\d+ (more|integrations)/);
	assert.doesNotMatch(lines[2], /codex week/);
});

test("renderShellBar compacts runtime details before omitting provider usage", () => {
	const usage = {
		provider: "openai-codex",
		plan: "pro",
		fetchedAt: 0,
		limits: [{ name: "codex", limitReached: false, windows: [{ label: "week", usedPercent: 4, windowSeconds: 604_800, resetAt: null }] }],
	};
	const lines = renderShellBar(model({ usage, statuses: ["MCP: 3 servers enabled"] }), plainTheme, 55);
	assert.equal(lines.length, 3);
	assert.match(lines[1], /codex week/);
	assert.match(lines[2], /MCP: 3 servers enabled/);
});

test("renderShellBar keeps the session on the project line and reports narrow status omissions", () => {
	const wide = model({ sessionName: "Release notes", statuses: ["MCP: 3 servers enabled", "Engram ready"] });
	const atNinety = renderShellBar(wide, plainTheme, 90);
	assert.equal(atNinety.length, 3);
	assert.match(atNinety[0], /Release notes$/);
	assert.match(atNinety[1], /gpt-5\.5/);
	assert.match(atNinety[2], /MCP: 3 servers enabled|\+1 integrations/);

	const atFifty = renderShellBar(wide, plainTheme, 50);
	assert.equal(atFifty.length, 3);
	for (const line of atFifty) assert.ok(visibleWidth(line) <= 50, `line overflowed: ${visibleWidth(line)}`);
	assert.match(atFifty[0], /^✿ gentle-pi/);
});

test("renderShellBar keeps ANSI, Unicode, and long sanitized statuses within three lines", () => {
	const ansiTheme: ShellBarTheme = {
		fg: (_color, text) => `\x1b[31m${text}\x1b[0m`,
		bold: (text) => text,
	};
	const lines = renderShellBar(model({
		cwd: "/workspace/設計/very-long-project-name",
		branch: "feature/非常に長いブランチ名",
		modelId: "gpt\n5.5",
		sessionName: "🚀 release notes",
		statuses: ["\x1b[32mMCP:\t3/3\x1b[0m", "Engram\nready", "A status that is deliberately very long"],
	}), ansiTheme, 42);
	assert.equal(lines.length, 3);
	for (const line of lines) {
		assert.ok(visibleWidth(line) <= 42, `line overflowed: ${visibleWidth(line)}`);
		assert.doesNotMatch(line, /\t|\n/);
	}
	// The compact project identity fills this width, so the session is omitted;
	// where there is remaining space, projectLine clips it before omission.
	assert.doesNotMatch(lines[0], /release|🚀/);
	assert.match(lines[1], /gpt 5\.5/);
	assert.match(lines[2], /\+\d+ (more|integrations)|MCP: 3\/3/);
});

test("shellEnabled stays off inside a Gentle Agents child", () => {
	assert.equal(shellEnabled({ GENTLE_PI_AGENTS_CHILD: "1" }), false);
});

test("shellEnabled honors GENTLE_PI_SHELL=0", () => {
	assert.equal(shellEnabled({}), true);
	assert.equal(shellEnabled({ GENTLE_PI_SHELL: "1" }), true);
	assert.equal(shellEnabled({ GENTLE_PI_SHELL: "0" }), false);
	assert.equal(shellEnabled({ GENTLE_PI_SHELL: "false" }), false);
});
