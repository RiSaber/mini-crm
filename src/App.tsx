import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ObjectsPage from './pages/ObjectsPage';
import ObjectPage from './pages/ObjectPage';
import TaskPage from './pages/TaskPage';
import TasksPage from './pages/TasksPage';

interface FromState {
	from?: string;
}

export default function App() {
	const { session, profile, loading, signedOut, signOut } = useAuth();
	const location = useLocation();

	if (loading) return <p className="center muted">Загрузка…</p>;

	// Не вошёл — только страница входа. Запоминаем, куда человек шёл по ссылке.
	if (!session) {
		const from = signedOut
			? undefined
			: location.pathname === '/login'
				? (location.state as FromState | null)?.from
				: location.pathname;
		return (
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="*" element={<Navigate to="/login" replace state={{ from }} />} />
			</Routes>
		);
	}

	if (!profile) {
		return (
			<div className="center">
				<p>Для вашей учётной записи не найден профиль. Обратитесь к администратору.</p>
				<button className="btn" onClick={signOut}>Выйти</button>
			</div>
		);
	}

	// Стартовая страница зависит от роли
	const home = profile.role === 'manager' ? '/objects' : '/tasks';
	// После входа возвращаем на ссылку, с которой пришли
	const from = (location.state as FromState | null)?.from;
	const afterLogin = from && from !== '/login' && from !== '/' ? from : home;

	return (
		<Routes>
			<Route element={<Layout />}>
				<Route path="/objects" element={<ObjectsPage />} />
				<Route path="/objects/:id" element={<ObjectPage />} />
				<Route path="/tasks" element={<TasksPage />} />
				<Route path="/tasks/:id" element={<TaskPage />} />
			</Route>
			<Route path="/login" element={<Navigate to={afterLogin} replace />} />
			<Route path="*" element={<Navigate to={home} replace />} />
		</Routes>
	);
}
