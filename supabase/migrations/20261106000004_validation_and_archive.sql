-- 1) «Пустые» строки: trim() в Postgres убирает только обычные пробелы,
--    а таб, перевод строки, неразрывный пробел (NBSP) и пробелы нулевой ширины пропускает.
--    Вводим одну функцию проверки и используем её в ограничениях и при смене статуса.
-- 2) Ограничения длины полей.
-- 3) История удалённой задачи больше не удаляется: задача и её история уходят в архив.

-- ============================================================
-- 1. Проверка «пустой» строки
-- ============================================================

create function private.is_blank(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select p is null or regexp_replace(
		p,
		'[[:space:]  ᠎ -‍    ⁠　﻿]',
		'',
		'g'
	) = '';
$$;

revoke execute on function private.is_blank(text) from public, anon;
grant execute on function private.is_blank(text) to authenticated;

-- ============================================================
-- 2. Ограничения полей
-- ============================================================

alter table public.objects drop constraint objects_name_check;
alter table public.objects
	add constraint objects_name_not_blank check (not private.is_blank(name)),
	add constraint objects_name_length check (char_length(name) <= 200),
	add constraint objects_address_length check (char_length(address) <= 300);

alter table public.tasks drop constraint tasks_title_check;
alter table public.tasks
	add constraint tasks_title_not_blank check (not private.is_blank(title)),
	add constraint tasks_title_length check (char_length(title) <= 200),
	add constraint tasks_description_length check (char_length(description) <= 5000);

alter table public.task_history
	add constraint task_history_comment_length check (comment is null or char_length(comment) <= 2000);

-- ============================================================
-- 3. Смена статуса: «пустой» комментарий = нет комментария
-- ============================================================

create or replace function public.change_task_status(
	p_task_id uuid,
	p_to public.task_status,
	p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_is_manager boolean := private.is_manager();
	v_task public.tasks;
	v_from public.task_status;
	v_comment text := case when private.is_blank(p_comment) then null else btrim(p_comment) end;
	v_allowed boolean;
begin
	if v_uid is null then
		raise exception 'Нужно войти в систему' using errcode = '28000';
	end if;

	-- for update блокирует строку: два одновременных нажатия не сломают цепочку статусов
	select * into v_task from public.tasks where id = p_task_id for update;

	-- Чужую задачу исполнитель «не видит»: отвечаем так же, как если бы её не было
	if not found or (not v_is_manager and v_task.assignee_id <> v_uid) then
		raise exception 'Задача не найдена' using errcode = 'P0002';
	end if;

	-- Таблица разрешённых переходов из ТЗ
	v_allowed := case
		when v_task.status = 'new'         and p_to = 'in_progress' then v_task.assignee_id = v_uid
		when v_task.status = 'in_progress' and p_to = 'review'      then v_task.assignee_id = v_uid
		when v_task.status = 'review'      and p_to = 'accepted'    then v_is_manager
		when v_task.status = 'review'      and p_to = 'rework'      then v_is_manager
		when v_task.status = 'rework'      and p_to = 'in_progress' then v_task.assignee_id = v_uid
		else false
	end;

	if not v_allowed then
		raise exception 'Переход статуса недоступен: % → %', v_task.status, p_to
			using errcode = '42501';
	end if;

	if p_to = 'rework' and v_comment is null then
		raise exception 'При возврате на доработку комментарий обязателен' using errcode = '22023';
	end if;

	v_from := v_task.status;

	update public.tasks set status = p_to where id = p_task_id returning * into v_task;

	insert into public.task_history (task_id, changed_by, from_status, to_status, comment)
	values (p_task_id, v_uid, v_from, p_to, v_comment);

	return v_task;
end;
$$;

revoke execute on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

-- ============================================================
-- 4. Архив удалённых задач: история не удаляется вместе с задачей
-- ============================================================

-- Снимок удалённой задачи. Схема private через API недоступна.
create table private.deleted_tasks (
	id uuid primary key,
	title text not null,
	description text not null,
	object_id uuid not null,
	assignee_id uuid not null,
	author_id uuid not null,
	status public.task_status not null,
	created_at timestamptz not null,
	deleted_by uuid,
	deleted_at timestamptz not null default now()
);

revoke all on private.deleted_tasks from public, anon, authenticated;

create function private.archive_deleted_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into private.deleted_tasks
		(id, title, description, object_id, assignee_id, author_id, status, created_at, deleted_by)
	values
		(old.id, old.title, old.description, old.object_id, old.assignee_id, old.author_id, old.status, old.created_at, auth.uid());
	return old;
end;
$$;

revoke execute on function private.archive_deleted_task() from public, anon, authenticated;

create trigger tasks_archive_on_delete
	before delete on public.tasks
	for each row execute function private.archive_deleted_task();

-- Раньше история удалялась каскадом вместе с задачей. Убираем внешний ключ:
-- записи истории остаются и ссылаются на задачу в архиве. Писать в историю
-- по-прежнему могут только функции базы, они берут id существующей задачи.
-- Через API историю удалённой задачи не увидеть: политика чтения требует,
-- чтобы задача существовала и была доступна пользователю.
alter table public.task_history drop constraint task_history_task_id_fkey;
