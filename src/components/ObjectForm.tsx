import { useState, type FormEvent } from 'react';

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
		setBusy(true);
		const err = await onSubmit({ name: name.trim(), address: address.trim() });
		setBusy(false);
		if (err) setError(err);
	}

	return (
		<form className="card form" onSubmit={submit}>
			<label className="field">
				<span>Название</span>
				<input required value={name} onChange={(e) => setName(e.target.value)} />
			</label>
			<label className="field">
				<span>Адрес</span>
				<input value={address} onChange={(e) => setAddress(e.target.value)} />
			</label>
			{error && <p className="error" role="alert">{error}</p>}
			<div className="actions">
				<button className="btn btn--primary" disabled={busy}>{submitLabel}</button>
				<button type="button" className="btn btn--ghost" onClick={onCancel}>Отмена</button>
			</div>
		</form>
	);
}
