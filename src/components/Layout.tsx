import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useProfile } from '../auth/AuthContext';

export default function Layout() {
	const { signOut } = useAuth();
	const profile = useProfile();
	const isManager = profile.role === 'manager';
	const { pathname } = useLocation();
	const mainRef = useRef<HTMLElement>(null);
	const firstRender = useRef(true);

	// При переходе на другой экран переносим фокус в начало содержимого,
	// чтобы клавиатура и скринридер начинали с нового экрана, а не с потерянной кнопки
	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}
		mainRef.current?.focus({ preventScroll: true });
		window.scrollTo(0, 0);
	}, [pathname]);

	return (
		<>
			<a className="skip-link" href="#main">Перейти к содержимому</a>
			<header className="header">
				<div className="container header__inner">
					<span className="logo">Объекты и задачи</span>
					<nav className="nav" aria-label="Основное меню">
						<NavLink to="/objects" className="nav__link">Объекты</NavLink>
						<NavLink to="/tasks" className="nav__link">{isManager ? 'Все задачи' : 'Мои задачи'}</NavLink>
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
			<main id="main" ref={mainRef} tabIndex={-1} className="container main">
				<Outlet />
			</main>
		</>
	);
}
