import { createClient } from '@supabase/supabase-js';

// Во фронтенде только публичный ключ: он ничего не открывает сам по себе,
// доступ к данным решают правила RLS в базе.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
	throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. .env.example)');
}

export const supabase = createClient(url, anonKey);

// Понятный текст ошибки для пользователя
export function errorText(error: unknown): string {
	if (error && typeof error === 'object' && 'message' in error) {
		const msg = String((error as { message: string }).message);
		if (msg.includes('violates foreign key constraint') && msg.includes('objects')) {
			return 'Нельзя удалить объект, пока в нём есть задачи';
		}
		if (msg === 'Invalid login credentials') return 'Неверный email или пароль';
		return msg;
	}
	return 'Неизвестная ошибка';
}
