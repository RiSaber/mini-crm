-- Вспомогательная функция is_manager() нужна только политикам RLS.
-- Переносим её в схему private: Supabase не публикует эту схему в API,
-- поэтому вызвать функцию напрямую через /rpc больше нельзя (замечание Security Advisor).

create schema if not exists private;
grant usage on schema private to authenticated;

-- Политики ссылаются на функцию по внутреннему id, поэтому продолжат работать после переноса
alter function public.is_manager() set schema private;
revoke execute on function private.is_manager() from public, anon;
grant execute on function private.is_manager() to authenticated;

-- change_task_status вызывала public.is_manager() по имени — обновляем ссылку
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
	v_comment text := nullif(trim(coalesce(p_comment, '')), '');
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
