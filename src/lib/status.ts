import type { Profile, Task, TaskStatus } from './types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
	new: 'Новая',
	in_progress: 'В работе',
	review: 'На проверке',
	accepted: 'Принята',
	rework: 'На доработке',
};

export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted'];

export interface StatusAction {
	to: TaskStatus;
	label: string;
	needsComment: boolean;
	primary?: boolean;
}

// Какие кнопки показать пользователю. Это только подсказка интерфейсу:
// те же правила проверяет база в функции change_task_status, и обойти их запросом нельзя.
export function availableActions(task: Task, user: Profile): StatusAction[] {
	const isAssignee = task.assignee_id === user.id;
	const isManager = user.role === 'manager';

	switch (task.status) {
		case 'new':
			return isAssignee ? [{ to: 'in_progress', label: 'Взять в работу', needsComment: false, primary: true }] : [];
		case 'in_progress':
			return isAssignee ? [{ to: 'review', label: 'Отправить на проверку', needsComment: false, primary: true }] : [];
		case 'review':
			return isManager
				? [
					{ to: 'accepted', label: 'Принять', needsComment: false, primary: true },
					{ to: 'rework', label: 'Вернуть на доработку', needsComment: true },
				]
				: [];
		case 'rework':
			return isAssignee ? [{ to: 'in_progress', label: 'Взять в работу снова', needsComment: false, primary: true }] : [];
		default:
			return [];
	}
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}
