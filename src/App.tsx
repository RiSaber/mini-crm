import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ObjectsPage from './pages/ObjectsPage';
import ObjectPage from './pages/ObjectPage';
import TaskPage from './pages/TaskPage';
import TasksPage from './pages/TasksPage';

export default function App() {
	const { session, profile, loading, signOut } = useAuth();

	if (loading) return <p className="center muted">Загрузка…</p>;

	// Не вошёл — только страница входа
	if (!session) {
		return (
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="*" element={<Navigate to="/login" replace />} />
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

	return (
		<Routes>
			<Route element={<Layout />}>
				<Route path="/objects" element={<ObjectsPage />} />
				<Route path="/objects/:id" element={<ObjectPage />} />
				<Route path="/tasks" element={<TasksPage />} />
				<Route path="/tasks/:id" element={<TaskPage />} />
			</Route>
			<Route path="*" element={<Navigate to={home} replace />} />
		</Routes>
	);
}
