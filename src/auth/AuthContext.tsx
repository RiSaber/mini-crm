import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

interface AuthState {
	session: Session | null;
	profile: Profile | null;
	loading: boolean;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [profile, setProfile] = useState<Profile | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Следим за входом и выходом; сессия хранится самим supabase-js
		const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
			setSession(s);
			if (!s) {
				setProfile(null);
				setLoading(false);
			}
		});
		return () => sub.subscription.unsubscribe();
	}, []);

	const userId = session?.user.id;
	useEffect(() => {
		if (!userId) return;
		let cancelled = false;
		setLoading(true);
		// Роль берём из базы, а не из браузера: подделать её на клиенте бесполезно
		supabase
			.from('profiles')
			.select('id, email, full_name, role')
			.eq('id', userId)
			.single()
			.then(({ data }) => {
				if (cancelled) return;
				setProfile(data as Profile | null);
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [userId]);

	const signOut = async () => {
		await supabase.auth.signOut();
	};

	return <AuthContext.Provider value={{ session, profile, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth вне AuthProvider');
	return ctx;
}

// Профиль гарантированно есть внутри защищённых страниц
export function useProfile(): Profile {
	const { profile } = useAuth();
	if (!profile) throw new Error('Профиль не загружен');
	return profile;
}
