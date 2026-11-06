import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useProfile } from '../auth/AuthContext';
import ObjectForm, { type ObjectValues } from '../components/ObjectForm';
import TaskForm, { type TaskValues } from '../components/TaskForm';
import TaskList from '../components/TaskList';
import { errorText, supabase } from '../lib/supabase';
import { TASK_SELECT, type CrmObject, type Task } from '../lib/types';

export default function ObjectPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const profile = useProfile();
	const isManager = profile.role === 'manager';

	const [object, setObject] = useState<CrmObject | null | undefined>(undefined);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [mode, setMode] = useState<'view' | 'edit' | 'newTask'>('view');
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		const [o, t] = await Promise.all([
			supabase.from('objects').select('*').eq('id', id!).maybeSingle(),
			supabase.from('tasks').select(TASK_SELECT).eq('object_id', id!).order('created_at'),
		]);
		if (o.error || t.error) setError(errorText(o.error ?? t.error));
		setObject(o.data as CrmObject | null);
		setTasks((t.data as Task[]) ?? []);
	}, [id]);

	useEffect(() => {
		load();
	}, [load]);

	async function save(values: ObjectValues) {
		const { error } = await supabase.from('objects').update(values).eq('id', id!);
		if (error) return errorText(error);
		setMode('view');
		await load();
		return null;
	}

	async function remove() {
		if (!confirm('Удалить объект? Это возможно, только если в нём нет задач.')) return;
		const { error } = await supabase.from('objects').delete().eq('id', id!);
		if (error) setError(errorText(error));
		else navigate('/objects');
	}

	async function createTask(values: TaskValues) {
		const { data, error } = await supabase.from('tasks').insert(values).select('id').single();
		if (error) return errorText(error);
		navigate(`/tasks/${data.id}`);
		return null;
	}

	if (object === undefined) return <p className="muted">Загрузка…</p>;
	// Чужой объект RLS просто не вернёт — выглядит как «не найден»
	if (object === null) {
		return (
			<>
				<p>Объект не найден или нет доступа.</p>
				<Link to="/objects">← К объектам</Link>
			</>
		);
	}

	return (
		<>
			<Link to="/objects" className="back">← Объекты</Link>
			{mode === 'edit' ? (
				<ObjectForm initial={{ name: object.name, address: object.address }} submitLabel="Сохранить" onSubmit={save} onCancel={() => setMode('view')} />
			) : (
				<div className="page-head">
					<div>
						<h1>{object.name}</h1>
						<p className="muted">{object.address || 'Адрес не указан'}</p>
					</div>
					{isManager && (
						<div className="actions">
							<button className="btn" onClick={() => setMode('edit')}>Изменить</button>
							<button className="btn btn--danger" onClick={remove}>Удалить</button>
						</div>
					)}
				</div>
			)}
			{error && <p className="error" role="alert">{error}</p>}

			<div className="page-head">
				<h2>{isManager ? 'Задачи' : 'Ваши задачи по объекту'}</h2>
				{isManager && mode !== 'newTask' && (
					<button className="btn btn--primary" onClick={() => setMode('newTask')}>+ Новая задача</button>
				)}
			</div>
			{mode === 'newTask' && (
				<TaskForm fixedObjectId={object.id} submitLabel="Создать задачу" onSubmit={createTask} onCancel={() => setMode('view')} />
			)}
			<TaskList tasks={tasks} empty="Задач пока нет." />
		</>
	);
}
