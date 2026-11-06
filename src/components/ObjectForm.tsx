import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { isBlank, MAX } from '../lib/text';

export interface ObjectValues {
	name: string;
	address: string;
}

interface Props {
	initial?: ObjectValues;
	submitLabel: string;
	onSubmit: (values: ObjectValues) => Promise<string | null>; // вернёт текст ошибки или null
	onCancel: () => void;
}

export default function ObjectForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
	const [name, setName] = useState(initial?.name ?? '');
	const [address, setAddress] = useState(initial?.address ?? '');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		// Строка из одних пробелов проходит атрибут required, поэтому проверяем сами
		if (isBlank(name)) {
			setError('Укажите название объекта');
			return;
		}
		setBusy(true);
		setError('');
		const err = await onSubmit({ name: name.trim(), address: address.trim() });
		setBusy(false);
		if (err) setError(err);
	}

	// Esc закрывает форму
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onCancel();
	}

	return (
		<form className="card form" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
			<label className="field">
				<span>Название</span>
				<input
					required
					autoFocus
					maxLength={MAX.name}
					value={name}
					onChange={(e) => setName(e.target.value)}
					aria-invalid={error ? true : undefined}
				/>
			</label>
			<label className="field">
				<span>Адрес</span>
				<input maxLength={MAX.address} value={address} onChange={(e) => setAddress(e.target.value)} />
			</label>
			{error && <p className="error" role="alert">{error}</p>}
			<div className="actions">
				<button className="btn btn--primary" disabled={busy}>{submitLabel}</button>
				<button type="button" className="btn btn--ghost" onClick={onCancel}>Отмена</button>
			</div>
		</form>
	);
}
