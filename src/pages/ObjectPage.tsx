import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useProfile } from '../auth/AuthContext';
import ObjectForm, { type ObjectValues } from '../components/ObjectForm';
import TaskForm, { type TaskValues } from '../components/TaskForm';
import TaskList from '../components/TaskList';
import { errorText, supabase } from '../lib/supabase';
import { useTitle } from '../lib/text';
import { TASK_SELECT, type CrmObject, type Task } from '../lib/types';

type Mode = 'view' | 'edit' | 'newTask';

export default function ObjectPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const profile = useProfile();
	const isManager = profile.role === 'manager';

	const [object, setObject] = useState<CrmObject | null | undefined>(undefined);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [mode, setMode] = useState<Mode>('view');
	const [error, setError] = useState('');
	const editButton = useRef<HTMLButtonElement>(null);
	const newTaskButton = useRef<HTMLButtonElement>(null);
	useTitle(object?.name ?? 'Объект');

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

	// Смена режима сбрасывает старую ошибку
	function openMode(next: Mode) {
		setError('');
		setMode(next);
	}

	// Закрыли форму — возвращаем фокус на кнопку, которая её открыла
	function closeForm() {
		const opener = mode === 'edit' ? editButton : newTaskButton;
		setMode('view');
		requestAnimationFrame(() => opener.current?.focus());
	}

	async function save(values: ObjectValues) {
		const { error } = await supabase.from('objects').update(values).eq('id', id!);
		if (error) return errorText(error);
		closeForm();
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
				<h1>Объект не найден</h1>
				<p>Объект удалён или у вас нет к нему доступа.</p>
				<Link to="/objects">← К объектам</Link>
			</>
		);
	}

	return (
		<>
			<Link to="/objects" className="back">← Объекты</Link>
			{mode === 'edit' ? (
				<ObjectForm initial={{ name: object.name, address: object.address }} submitLabel="Сохранить" onSubmit={save} onCancel={closeForm} />
			) : (
				<div className="page-head">
					<div className="page-head__main">
						<h1>{object.name}</h1>
						<p className="muted">{object.address || 'Адрес не указан'}</p>
					</div>
					{isManager && (
						<div className="actions">
							<button ref={editButton} className="btn" onClick={() => openMode('edit')}>Изменить</button>
							<button className="btn btn--danger" onClick={remove}>Удалить</button>
						</div>
					)}
				</div>
			)}
			{error && <p className="error" role="alert">{error}</p>}

			<div className="page-head">
				<h2>{isManager ? 'Задачи' : 'Ваши задачи по объекту'}</h2>
				{isManager && mode !== 'newTask' && (
					<button ref={newTaskButton} className="btn btn--primary" onClick={() => openMode('newTask')}>+ Новая задача</button>
				)}
			</div>
			{mode === 'newTask' && (
				<TaskForm fixedObjectId={object.id} submitLabel="Создать задачу" onSubmit={createTask} onCancel={closeForm} />
			)}
			<TaskList tasks={tasks} empty="Задач пока нет." />
		</>
	);
}
