import { createClient } from '@supabase/supabase-js';

// Во фронтенде только публичный ключ: он ничего не открывает сам по себе,
// доступ к данным решают правила RLS в базе.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
	throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. .env.example)');
}

export const supabase = createClient(url, anonKey);

// Сообщения базы → понятный русский текст. Ищем по фрагменту сообщения.
const ERROR_MAP: [string, string][] = [
	['violates foreign key constraint "tasks_object_id_fkey"', 'Нельзя удалить объект, пока в нём есть задачи'],
	['objects_name_not_blank', 'Укажите название объекта'],
	['objects_name_length', 'Название объекта слишком длинное'],
	['objects_address_length', 'Адрес слишком длинный'],
	['tasks_title_not_blank', 'Укажите название задачи'],
	['tasks_title_length', 'Название задачи слишком длинное'],
	['tasks_description_length', 'Описание слишком длинное'],
	['task_history_comment_length', 'Комментарий слишком длинный'],
	['Переход статуса недоступен', 'Это действие уже недоступно: статус задачи изменился. Данные обновлены.'],
	['Invalid login credentials', 'Неверный email или пароль'],
	['Failed to fetch', 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'],
];

// Понятный текст ошибки для пользователя
export function errorText(error: unknown): string {
	if (error && typeof error === 'object' && 'message' in error) {
		const msg = String((error as { message: string }).message);
		const found = ERROR_MAP.find(([needle]) => msg.includes(needle));
		if (found) return found[1];
		// Свои сообщения база пишет по-русски — их показываем как есть
		if (/[а-яё]/i.test(msg)) return msg;
		console.error(msg);
		return 'Не удалось выполнить действие. Попробуйте ещё раз.';
	}
	return 'Неизвестная ошибка';
}
