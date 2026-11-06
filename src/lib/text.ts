import { useEffect } from 'react';

// Строка «пустая», если в ней только пробелы любого вида:
// таб, перевод строки, неразрывный пробел, пробелы нулевой ширины.
// Та же проверка есть в базе (private.is_blank).
export function isBlank(value: string | null | undefined): boolean {
	return !value || value.replace(/[\s᠎​-‍⁠﻿]/g, '') === '';
}

// Ограничения длины — те же, что в базе
export const MAX = {
	name: 200,
	address: 300,
	description: 5000,
	comment: 2000,
} as const;

// Заголовок вкладки браузера для текущего экрана
export function useTitle(title: string | undefined) {
	useEffect(() => {
		document.title = title ? `${title} — Объекты и задачи` : 'Объекты и задачи';
	}, [title]);
}
