import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';

export default function LoginPage() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError('');
		const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
		// При успехе AuthContext сам получит сессию и перерисует приложение
		if (error) setError(errorText(error));
		setBusy(false);
	}

	return (
		<main className="login">
			<form className="card login__form" onSubmit={onSubmit}>
				<h1>Вход</h1>
				<p className="muted">Мини-CRM «Объекты и задачи». Регистрация закрыта, учётные записи выдаёт администратор.</p>
				<label className="field">
					<span>Email</span>
					<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
				</label>
				<label className="field">
					<span>Пароль</span>
					<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
				</label>
				{error && <p className="error" role="alert">{error}</p>}
				<button className="btn btn--primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
			</form>
		</main>
	);
}
