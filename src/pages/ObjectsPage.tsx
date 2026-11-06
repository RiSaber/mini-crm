import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../auth/AuthContext';
import ObjectForm, { type ObjectValues } from '../components/ObjectForm';
import { errorText, supabase } from '../lib/supabase';
import { useTitle } from '../lib/text';
import type { CrmObject } from '../lib/types';

type Row = CrmObject & { tasks: { status: string }[] };

export default function ObjectsPage() {
	const profile = useProfile();
	const isManager = profile.role === 'manager';
	const [rows, setRows] = useState<Row[] | null>(null);
	const [error, setError] = useState('');
	const [creating, setCreating] = useState(false);
	const addButton = useRef<HTMLButtonElement>(null);
	useTitle('Объекты');

	// Закрыли форму — возвращаем фокус на кнопку, которая её открыла
	function closeForm() {
		setCreating(false);
		requestAnimationFrame(() => addButton.current?.focus());
	}

	// Исполнителю база сама вернёт только объекты с его задачами (и только его задачи внутри)
	const load = useCallback(async () => {
		const { data, error } = await supabase.from('objects').select('*, tasks(status)').order('created_at');
		if (error) setError(errorText(error));
		else setRows(data as Row[]);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	async function create(values: ObjectValues) {
		const { error } = await supabase.from('objects').insert(values);
		if (error) return errorText(error);
		closeForm();
		await load();
		return null;
	}

	return (
		<>
			<div className="page-head">
				<h1>Объекты</h1>
				{isManager && !creating && (
					<button ref={addButton} className="btn btn--primary" onClick={() => setCreating(true)}>+ Новый объект</button>
				)}
			</div>
			{creating && <ObjectForm submitLabel="Создать" onSubmit={create} onCancel={closeForm} />}
			{error && <p className="error" role="alert">{error}</p>}
			{!rows && !error && <p className="muted">Загрузка…</p>}
			{rows && rows.length === 0 && (
				<p className="muted">{isManager ? 'Объектов пока нет.' : 'Нет объектов с вашими задачами.'}</p>
			)}
			<ul className="list">
				{rows?.map((o) => {
					const open = o.tasks.filter((t) => t.status !== 'accepted').length;
					return (
						<li key={o.id}>
							<Link to={`/objects/${o.id}`} className="card card--link">
								<strong>{o.name}</strong>
								<span className="muted">{o.address || 'Адрес не указан'}</span>
								<span className="muted small">
									{isManager ? 'Задач' : 'Ваших задач'}: {o.tasks.length}, не закрыто: {open}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</>
	);
}
