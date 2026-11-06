import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { CrmObject, Profile } from '../lib/types';

export interface TaskValues {
	title: string;
	description: string;
	object_id: string;
	assignee_id: string;
}

interface Props {
	initial?: TaskValues;
	fixedObjectId?: string; // форма внутри карточки объекта — объект уже выбран
	submitLabel: string;
	onSubmit: (values: TaskValues) => Promise<string | null>;
	onCancel: () => void;
}

export default function TaskForm({ initial, fixedObjectId, submitLabel, onSubmit, onCancel }: Props) {
	const [values, setValues] = useState<TaskValues>(
		initial ?? { title: '', description: '', object_id: fixedObjectId ?? '', assignee_id: '' },
	);
	const [objects, setObjects] = useState<CrmObject[]>([]);
	const [executors, setExecutors] = useState<Profile[]>([]);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		supabase.from('objects').select('*').order('name').then(({ data }) => setObjects((data as CrmObject[]) ?? []));
		supabase
			.from('profiles')
			.select('id, email, full_name, role')
			.eq('role', 'executor')
			.order('full_name')
			.then(({ data }) => setExecutors((data as Profile[]) ?? []));
	}, []);

	const set = (key: keyof TaskValues) => (e: { target: { value: string } }) =>
		setValues((v) => ({ ...v, [key]: e.target.value }));

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		const err = await onSubmit({ ...values, title: values.title.trim(), description: values.description.trim() });
		setBusy(false);
		if (err) setError(err);
	}

	return (
		<form className="card form" onSubmit={submit}>
			<label className="field">
				<span>Название</span>
				<input required value={values.title} onChange={set('title')} />
			</label>
			<label className="field">
				<span>Описание</span>
				<textarea rows={3} value={values.description} onChange={set('description')} />
			</label>
			{!fixedObjectId && (
				<label className="field">
					<span>Объект</span>
					<select required value={values.object_id} onChange={set('object_id')}>
						<option value="" disabled>Выберите объект</option>
						{objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
					</select>
				</label>
			)}
			<label className="field">
				<span>Исполнитель</span>
				<select required value={values.assignee_id} onChange={set('assignee_id')}>
					<option value="" disabled>Выберите исполнителя</option>
					{executors.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
				</select>
			</label>
			{error && <p className="error" role="alert">{error}</p>}
			<div className="actions">
				<button className="btn btn--primary" disabled={busy}>{submitLabel}</button>
				<button type="button" className="btn btn--ghost" onClick={onCancel}>Отмена</button>
			</div>
		</form>
	);
}
