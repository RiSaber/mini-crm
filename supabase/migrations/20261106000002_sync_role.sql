-- Supabase (Auth Admin API) создаёт пользователя и записывает app_metadata отдельным шагом,
-- поэтому при вставке роль ещё не видна. Синхронизируем роль и при обновлении app_metadata.
-- app_metadata может менять только администратор (секретный ключ), сам пользователь — нет.

create function public.sync_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.raw_app_meta_data ->> 'role' in ('manager', 'executor') then
		update public.profiles
		set role = (new.raw_app_meta_data ->> 'role')::public.user_role
		where id = new.id;
	end if;
	return new;
end;
$$;

revoke execute on function public.sync_user_role() from public, anon, authenticated;

create trigger on_auth_user_role_changed
	after update of raw_app_meta_data on auth.users
	for each row execute function public.sync_user_role();

-- Применяем к уже созданным пользователям
update public.profiles p
set role = (u.raw_app_meta_data ->> 'role')::public.user_role
from auth.users u
where u.id = p.id and u.raw_app_meta_data ->> 'role' in ('manager', 'executor');
