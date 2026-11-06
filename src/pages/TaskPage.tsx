import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useProfile } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';
import TaskForm, { type TaskValues } from '../components/TaskForm';
import { availableActions, formatDate, STATUS_LABEL, type StatusAction } from '../lib/status';
import { errorText, supabase } from '../lib/supabase';
import { isBlank, MAX, useTitle } from '../lib/text';
import { TASK_SELECT, type HistoryItem, type Task } from '../lib/types';

export default function TaskPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const profile = useProfile();
	const isManager = profile.role === 'manager';

	const [task, setTask] = useState<Task | null | undefined>(undefined);
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [editing, setEditing] = useState(false);
	const [comment, setComment] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const editButton = useRef<HTMLButtonElement>(null);
	useTitle(task?.title ?? 'Задача');

	function closeEdit() {
		setEditing(false);
		requestAnimationFrame(() => editButton.current?.focus());
	}

	const load = useCallback(async () => {
		const [t, h] = await Promise.all([
			supabase.from('tasks').select(TASK_SELECT).eq('id', id!).maybeSingle(),
			supabase
				.from('task_history')
				.select('id, from_status, to_status, comment, created_at, changed_by_profile:profiles(full_name)')
				.eq('task_id', id!)
				.order('created_at')
				.order('id'),
		]);
		setTask(t.data as Task | null);
		setHistory((h.data as unknown as HistoryItem[]) ?? []);
	}, [id]);

	useEffect(() => {
		load();
	}, [load]);

	// Смена статуса — только через функцию базы: она сама проверит, можно ли так
	async function act(action: StatusAction) {
		if (!task) return;
		if (action.needsComment && isBlank(comment)) {
			setError('Напишите комментарий: что нужно доработать');
			return;
		}
		setBusy(true);
		setError('');
		const { error } = await supabase.rpc('change_task_status', {
			p_task_id: task.id,
			p_to: action.to,
			p_comment: isBlank(comment) ? null : comment.trim(),
		});
		setBusy(false);
		if (error) {
			setError(errorText(error));
			// Статус мог поменяться в другой вкладке — показываем актуальное состояние
			await load();
			return;
		}
		setComment('');
		await load();
	}

	async function save(values: TaskValues) {
		const { error } = await supabase.from('tasks').update(values).eq('id', id!);
		if (error) return errorText(error);
		closeEdit();
		await load();
		return null;
	}

	async function remove() {
		if (!task || !confirm('Удалить задачу вместе с историей?')) return;
		const { error } = await supabase.from('tasks').delete().eq('id', task.id);
		if (error) setError(errorText(error));
		else navigate(`/objects/${task.object_id}`);
	}

	if (task === undefined) return <p className="muted">Загрузка…</p>;
	if (task === null) {
		return (
			<>
				<h1>Задача не найдена</h1>
				<p>Задача удалена или у вас нет к ней доступа.</p>
				<Link to="/tasks">← К задачам</Link>
			</>
		);
	}

	const actions = availableActions(task, profile);
	const canComment = actions.length > 0;

	return (
		<>
			<Link to={`/objects/${task.object_id}`} className="back">← {task.object?.name ?? 'Объект'}</Link>

			{editing ? (
				<TaskForm
					initial={{ title: task.title, description: task.description, object_id: task.object_id, assignee_id: task.assignee_id }}
					submitLabel="Сохранить"
					onSubmit={save}
					onCancel={closeEdit}
				/>
			) : (
				<article className="card">
					<div className="page-head">
						<h1 className="page-head__main">{task.title}</h1>
						<StatusBadge status={task.status} />
					</div>
					{task.description && <p className="pre">{task.description}</p>}
					<dl className="meta">
						<dt>Объект</dt>
						<dd><Link to={`/objects/${task.object_id}`}>{task.object?.name}</Link></dd>
						<dt>Исполнитель</dt>
						<dd>{task.assignee?.full_name}</dd>
						<dt>Автор</dt>
						<dd>{task.author?.full_name}</dd>
						<dt>Создана</dt>
						<dd>{formatDate(task.created_at)}</dd>
					</dl>
					{isManager && (
						<div className="actions">
							<button ref={editButton} className="btn" onClick={() => { setError(''); setEditing(true); }}>Изменить</button>
							<button className="btn btn--danger" onClick={remove}>Удалить</button>
						</div>
					)}
				</article>
			)}

			{canComment && (
				<section className="card" aria-labelledby="actions-title">
					<h2 id="actions-title">Действия</h2>
					<label className="field">
						<span>Комментарий {actions.some((a) => a.needsComment) ? '(обязателен при возврате на доработку)' : '(необязательно)'}</span>
						<textarea rows={2} maxLength={MAX.comment} value={comment} onChange={(e) => setComment(e.target.value)} />
					</label>
					<div className="actions">
						{actions.map((a) => (
							<button key={a.to} className={`btn ${a.primary ? 'btn--primary' : ''}`} disabled={busy} onClick={() => act(a)}>
								{a.label}
							</button>
						))}
					</div>
				</section>
			)}
			{error && <p className="error" role="alert">{error}</p>}

			<section aria-labelledby="history-title">
				<h2 id="history-title">История</h2>
				<ol className="history">
					{history.map((h) => (
						<li key={h.id} className="history__item">
							<div>
								<strong>{h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : 'Создана: '}{STATUS_LABEL[h.to_status]}</strong>
								<span className="muted small"> · {h.changed_by_profile?.full_name} · {formatDate(h.created_at)}</span>
							</div>
							{h.comment && <p className="history__comment pre">{h.comment}</p>}
						</li>
					))}
				</ol>
			</section>
		</>
	);
}
