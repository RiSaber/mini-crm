import { useEffect, useState } from 'react';
import { useProfile } from '../auth/AuthContext';
import TaskList from '../components/TaskList';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/status';
import { errorText, supabase } from '../lib/supabase';
import { useTitle } from '../lib/text';
import { TASK_SELECT, type Task, type TaskStatus } from '../lib/types';

// Для исполнителя — «Мои задачи», для постановщика — все задачи
export default function TasksPage() {
	const profile = useProfile();
	const isManager = profile.role === 'manager';
	const [tasks, setTasks] = useState<Task[] | null>(null);
	const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
	const [error, setError] = useState('');
	useTitle(isManager ? 'Все задачи' : 'Мои задачи');

	useEffect(() => {
		// Фильтр по исполнителю здесь для удобства; без него база всё равно не отдаст чужие задачи
		let q = supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false });
		if (!isManager) q = q.eq('assignee_id', profile.id);
		q.then(({ data, error }) => {
			if (error) setError(errorText(error));
			else setTasks(data as Task[]);
		});
	}, [isManager, profile.id]);

	const shown = tasks?.filter((t) => filter === 'all' || t.status === filter) ?? [];
	const count = (s: TaskStatus) => tasks?.filter((t) => t.status === s).length ?? 0;

	return (
		<>
			<h1>{isManager ? 'Все задачи' : 'Мои задачи'}</h1>
			<div className="filters" role="group" aria-label="Фильтр по статусу">
				<button className={`chip ${filter === 'all' ? 'chip--active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
					Все ({tasks?.length ?? 0})
				</button>
				{STATUS_ORDER.map((s) => (
					<button key={s} className={`chip ${filter === s ? 'chip--active' : ''}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
						{STATUS_LABEL[s]} ({count(s)})
					</button>
				))}
			</div>
			{error && <p className="error" role="alert">{error}</p>}
			{!tasks && !error && <p className="muted">Загрузка…</p>}
			{tasks && <TaskList tasks={shown} showObject empty="Задач нет." />}
		</>
	);
}
