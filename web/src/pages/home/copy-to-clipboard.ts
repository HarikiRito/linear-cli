/** Returns true on success, false if clipboard is unavailable or denied. */
export async function copyToClipboard(text: string): Promise<boolean> {
	if (!navigator?.clipboard) return false;
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
