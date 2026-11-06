export type Role = 'manager' | 'executor';
export type TaskStatus = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework';

export interface Profile {
	id: string;
	email: string;
	full_name: string;
	role: Role;
}

export interface CrmObject {
	id: string;
	name: string;
	address: string;
	created_at: string;
}

export interface Task {
	id: string;
	title: string;
	description: string;
	object_id: string;
	assignee_id: string;
	author_id: string;
	status: TaskStatus;
	created_at: string;
	object?: { id: string; name: string } | null;
	assignee?: { id: string; full_name: string } | null;
	author?: { id: string; full_name: string } | null;
}

export interface HistoryItem {
	id: number;
	from_status: TaskStatus | null;
	to_status: TaskStatus;
	comment: string | null;
	created_at: string;
	changed_by_profile?: { full_name: string } | null;
}

// Задача со связанными объектом, исполнителем и автором — одним запросом.
// У задачи две ссылки на profiles, поэтому связь указываем по имени ключа.
export const TASK_SELECT =
	'*, object:objects(id, name), assignee:profiles!tasks_assignee_id_fkey(id, full_name), author:profiles!tasks_author_id_fkey(id, full_name)';
