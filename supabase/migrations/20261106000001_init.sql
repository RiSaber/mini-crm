-- Мини-CRM «Объекты и задачи»: схема, права доступа и логика статусов.
-- Вся защита живёт в базе: интерфейс только показывает то, что база и так разрешает.

-- ============================================================
-- 1. Типы
-- ============================================================

-- manager — постановщик, executor — исполнитель
create type public.user_role as enum ('manager', 'executor');

-- new — Новая, in_progress — В работе, review — На проверке,
-- accepted — Принята, rework — На доработке
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

-- ============================================================
-- 2. Таблицы
-- ============================================================

-- Профиль пользователя: роль и имя. Строка создаётся автоматически при создании пользователя.
create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	email text not null,
	full_name text not null default '',
	role public.user_role not null default 'executor',
	created_at timestamptz not null default now()
);

-- Объект (стройка)
create table public.objects (
	id uuid primary key default gen_random_uuid(),
	name text not null check (length(trim(name)) > 0),
	address text not null default '',
	created_at timestamptz not null default now()
);

-- Задача по объекту
create table public.tasks (
	id uuid primary key default gen_random_uuid(),
	title text not null check (length(trim(title)) > 0),
	description text not null default '',
	-- объект нельзя удалить, пока в нём есть задачи
	object_id uuid not null references public.objects (id) on delete restrict,
	assignee_id uuid not null references public.profiles (id) on delete restrict,
	status public.task_status not null default 'new',
	-- автор подставляется базой: тот, кто вошёл в систему
	author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
	created_at timestamptz not null default now()
);

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- История смены статусов. Пишется только функциями базы, вручную её не изменить.
create table public.task_history (
	id bigint generated always as identity primary key,
	task_id uuid not null references public.tasks (id) on delete cascade,
	changed_by uuid not null references public.profiles (id) on delete restrict,
	from_status public.task_status,
	to_status public.task_status not null,
	comment text,
	created_at timestamptz not null default now()
);

create index task_history_task_id_idx on public.task_history (task_id, created_at);

-- ============================================================
-- 3. Вспомогательные функции
-- ============================================================

-- Является ли текущий пользователь постановщиком.
-- security definer — функция читает profiles в обход RLS, чтобы политики не зацикливались.
create function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select p.role = 'manager' from public.profiles p where p.id = auth.uid()),
		false
	);
$$;

-- Создаёт профиль при появлении нового пользователя в auth.users.
-- Роль берётся из app_metadata (её может задать только администратор), по умолчанию — исполнитель.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id, email, full_name, role)
	values (
		new.id,
		new.email,
		coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
		case when new.raw_app_meta_data ->> 'role' = 'manager'
			then 'manager'::public.user_role
			else 'executor'::public.user_role
		end
	);
	return new;
end;
$$;

create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

-- Исполнителем задачи может быть только пользователь с ролью «исполнитель».
create function public.check_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not exists (
		select 1 from public.profiles p
		where p.id = new.assignee_id and p.role = 'executor'
	) then
		raise exception 'Исполнителем можно назначить только пользователя с ролью «Исполнитель»'
			using errcode = '23514';
	end if;
	return new;
end;
$$;

create trigger tasks_check_assignee
	before insert or update of assignee_id on public.tasks
	for each row execute function public.check_task_assignee();

-- При создании задачи через API статус всегда «Новая», автор — текущий пользователь, дата — сейчас.
-- (Скрипты администратора без входа в систему, auth.uid() пустой, могут задавать значения сами.)
create function public.prepare_new_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is not null then
		new.status := 'new';
		new.author_id := auth.uid();
		new.created_at := now();
	end if;
	return new;
end;
$$;

create trigger tasks_prepare_new
	before insert on public.tasks
	for each row execute function public.prepare_new_task();

-- Первая запись истории: «— → Новая».
create function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.task_history (task_id, changed_by, from_status, to_status)
	values (new.id, new.author_id, null, new.status);
	return new;
end;
$$;

create trigger tasks_log_created
	after insert on public.tasks
	for each row execute function public.log_task_created();

-- ============================================================
-- 4. Смена статуса — единственный способ изменить статус задачи
-- ============================================================

create function public.change_task_status(
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
	v_is_manager boolean := public.is_manager();
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

-- ============================================================
-- 5. Права на уровне таблиц (что вообще можно делать через API)
-- ============================================================
-- Supabase по умолчанию выдаёт ролям anon и authenticated все права.
-- Забираем всё и выдаём только нужное.

revoke all on public.profiles, public.objects, public.tasks, public.task_history from anon, authenticated;

-- Профили — только чтение (роль себе не повысить)
grant select on public.profiles to authenticated;

-- Объекты — всё, а кому именно, решают политики RLS ниже
grant select, insert, update, delete on public.objects to authenticated;

-- Задачи: статус, автора и дату создания через API не изменить вообще — только через change_task_status
grant select, delete on public.tasks to authenticated;
grant insert (title, description, object_id, assignee_id) on public.tasks to authenticated;
grant update (title, description, object_id, assignee_id) on public.tasks to authenticated;

-- История — только чтение
grant select on public.task_history to authenticated;

-- Функции: снаружи доступны только нужные вошедшему пользователю
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

-- ============================================================
-- 6. Политики RLS (какие именно строки видит и меняет пользователь)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

-- Профили видят все вошедшие: нужно, чтобы показывать имена авторов и исполнителей
create policy profiles_select on public.profiles
	for select to authenticated
	using (true);

-- Объекты: постановщик видит все, исполнитель — только те, где у него есть задачи
create policy objects_select on public.objects
	for select to authenticated
	using (
		public.is_manager()
		or exists (
			select 1 from public.tasks t
			where t.object_id = objects.id and t.assignee_id = (select auth.uid())
		)
	);

create policy objects_insert on public.objects
	for insert to authenticated
	with check (public.is_manager());

create policy objects_update on public.objects
	for update to authenticated
	using (public.is_manager())
	with check (public.is_manager());

create policy objects_delete on public.objects
	for delete to authenticated
	using (public.is_manager());

-- Задачи: постановщик видит все, исполнитель — только свои
create policy tasks_select on public.tasks
	for select to authenticated
	using (public.is_manager() or assignee_id = (select auth.uid()));

create policy tasks_insert on public.tasks
	for insert to authenticated
	with check (public.is_manager());

create policy tasks_update on public.tasks
	for update to authenticated
	using (public.is_manager())
	with check (public.is_manager());

create policy tasks_delete on public.tasks
	for delete to authenticated
	using (public.is_manager());

-- История видна тому, кто видит саму задачу (правило задач выше применяется внутри)
create policy task_history_select on public.task_history
	for select to authenticated
	using (exists (select 1 from public.tasks t where t.id = task_history.task_id));
