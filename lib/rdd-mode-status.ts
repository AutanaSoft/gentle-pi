import {
	NATIVE_REVIEW_MODE_OPERATION,
	NATIVE_REVIEW_MODE_SCOPE,
	NATIVE_REVIEW_MODE_SOURCE,
	type NativeReviewCli,
	type NativeReviewModeScope,
	type NativeReviewModeStatus,
} from "./native-review-cli.ts";

export type RddModeValue = "on" | "off" | "unknown";
export type RddModeStatus = NativeReviewModeStatus & { scope: NativeReviewModeScope };
export const RDD_STATUS_TIMEOUT_MS = 3_000;
export const RDD_STATUS_MEMO_TTL_MS = 30_000;
export const RDD_MODE_STATUS_CHANGED = "gentle-pi:rdd-mode-status-changed";

const memo = new Map<string, { status: RddModeStatus | undefined; expiresAt: number }>();
let memoEpoch = 0;
const memoGeneration = new Map<string, number>();

export function isValidRddModeStatus(status: NativeReviewModeStatus | undefined): status is NativeReviewModeStatus {
	return status !== undefined && status !== null && typeof status === "object" &&
		(status.effective === "on" || status.effective === "off") &&
		typeof status.source === "string" && Object.values(NATIVE_REVIEW_MODE_SOURCE).includes(status.source);
}

/** Projects the native effective decision; cache contents are observations, never authority. */
export function projectRddMode(status: NativeReviewModeStatus | undefined): RddModeValue {
	return isValidRddModeStatus(status) ? status.effective : "unknown";
}

function abortRejection(signal: AbortSignal): Promise<never> {
	return new Promise((_resolve, reject) => {
		if (signal.aborted) return reject(signal.reason ?? new Error("aborted"));
		signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true });
	});
}

export async function resolveRddModeStatus(
	nativeReviewCli: Pick<NativeReviewCli, "reviewMode"> | null | undefined,
	cwd: string,
	signal?: AbortSignal,
	now: () => number = Date.now,
): Promise<RddModeStatus | undefined> {
	const nowMs = now();
	const cached = memo.get(cwd);
	if (cached && cached.expiresAt > nowMs) return cached.status;
	const epoch = memoEpoch;
	const generation = memoGeneration.get(cwd) ?? 0;
	let status: RddModeStatus | undefined;
	if (nativeReviewCli?.reviewMode) {
		const timeout = signal ?? AbortSignal.timeout(RDD_STATUS_TIMEOUT_MS);
		try {
			const result = await Promise.race([
				nativeReviewCli.reviewMode({ cwd, operation: NATIVE_REVIEW_MODE_OPERATION.STATUS, signal: timeout }),
				abortRejection(timeout),
			]);
			status = isValidRddModeStatus(result.status) && Object.values(NATIVE_REVIEW_MODE_SCOPE).includes(result.scope)
				? { ...result.status, scope: result.scope }
				: undefined;
		} catch { status = undefined; }
	}
	// An invalidation means a newer authoritative observation is required. A
	// completion started before it may still return to its caller, but cannot
	// repopulate the cache over a later same-cwd read.
	if (memoEpoch === epoch && (memoGeneration.get(cwd) ?? 0) === generation) {
		memo.set(cwd, { status, expiresAt: nowMs + RDD_STATUS_MEMO_TTL_MS });
	}
	return status;
}

export function invalidateRddModeStatus(cwd?: string): void {
	if (cwd === undefined) {
		memoEpoch += 1;
		memo.clear();
		return;
	}
	memo.delete(cwd);
	memoGeneration.set(cwd, (memoGeneration.get(cwd) ?? 0) + 1);
}

/** @internal test seam. */
export const clearRddStatusMemoForTesting = invalidateRddModeStatus;
