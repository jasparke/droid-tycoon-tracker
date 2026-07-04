export const toasts = $state({ list: [] as { id: number; msg: string }[] });
let seq = 0;
export function toast(msg: string) {
	const id = ++seq;
	toasts.list.push({ id, msg });
	setTimeout(() => {
		toasts.list = toasts.list.filter((t) => t.id !== id);
	}, 4000);
}
