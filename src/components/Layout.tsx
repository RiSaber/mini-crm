import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useProfile } from '../auth/AuthContext';

export default function Layout() {
	const { signOut } = useAuth();
	const profile = useProfile();
	const isManager = profile.role === 'manager';

	return (
		<>
			<header className="header">
				<div className="container header__inner">
					<span className="logo">Объекты и задачи</span>
					<nav className="nav" aria-label="Основное меню">
						<NavLink to="/objects" className="nav__link">Объекты</NavLink>
						<NavLink to="/tasks" end className="nav__link">{isManager ? 'Все задачи' : 'Мои задачи'}</NavLink>
					</nav>
					<div className="user">
						<span className="user__name">
							{profile.full_name}
							<span className="user__role">{isManager ? 'Постановщик' : 'Исполнитель'}</span>
						</span>
						<button className="btn btn--ghost" onClick={signOut}>Выйти</button>
					</div>
				</div>
			</header>
			<main className="container main">
				<Outlet />
			</main>
		</>
	);
}
