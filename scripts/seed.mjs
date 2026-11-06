// Тестовые данные: 1 постановщик, 2 исполнителя, 3 объекта, задачи в разных статусах.
// Пользователей создаёт админ-ключ (только локально), а задачи и смену статусов
// делаем от имени обычных пользователей — через те же правила, что и в интерфейсе.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;

if (!url || !anonKey || !serviceKey || !password) {
	console.error('Нужны VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY и SEED_PASSWORD в .env');
	process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const users = [
	{ email: 'manager@crm-demo.test', full_name: 'Ольга Петрова', role: 'manager' },
	{ email: 'worker1@crm-demo.test', full_name: 'Иван Смирнов', role: 'executor' },
	{ email: 'worker2@crm-demo.test', full_name: 'Алексей Козлов', role: 'executor' },
];

// Создаёт пользователя, если его ещё нет. Роль — в app_metadata: её не может поменять сам пользователь.
async function ensureUser(u) {
	const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
	if (listErr) throw listErr;
	const existing = list.users.find((x) => x.email === u.email);
	if (existing) return existing.id;
	const { data, error } = await admin.auth.admin.createUser({
		email: u.email,
		password,
		email_confirm: true,
		user_metadata: { full_name: u.full_name },
		app_metadata: { role: u.role },
	});
	if (error) throw error;
	return data.user.id;
}

// Клиент, вошедший под конкретным пользователем
async function signIn(email) {
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const { error } = await c.auth.signInWithPassword({ email, password });
	if (error) throw new Error(`${email}: ${error.message}`);
	return c;
}

function check(res, what) {
	if (res.error) throw new Error(`${what}: ${res.error.message}`);
	return res.data;
}

const ids = {};
for (const u of users) ids[u.email] = await ensureUser(u);

const { count } = await admin.from('objects').select('*', { count: 'exact', head: true });
if (count) {
	console.log('Данные уже есть, повторно не заполняю.');
	process.exit(0);
}

const manager = await signIn('manager@crm-demo.test');
const w1 = await signIn('worker1@crm-demo.test');
const w2 = await signIn('worker2@crm-demo.test');
const W1 = ids['worker1@crm-demo.test'];
const W2 = ids['worker2@crm-demo.test'];

const objects = check(await manager.from('objects').insert([
	{ name: 'ЖК «Северный»', address: 'г. Москва, ул. Северная, 12' },
	{ name: 'Склад «Логистик»', address: 'Московская обл., г. Химки, Промзона, 4' },
	{ name: 'Коттедж в Барвихе', address: 'Московская обл., д. Барвиха, 37' },
]).select(), 'объекты');
const [north, depot, cottage] = objects.map((o) => o.id);

const tasks = check(await manager.from('tasks').insert([
	{ title: 'Залить фундамент секции А', description: 'Бетон М300, проверить опалубку перед заливкой.', object_id: north, assignee_id: W1 },
	{ title: 'Смонтировать леса на фасаде', description: 'Северная и восточная стороны.', object_id: north, assignee_id: W2 },
	{ title: 'Проложить кабель освещения', description: 'Кабель ВВГнг 3×2,5, по плану электрики.', object_id: north, assignee_id: W1 },
	{ title: 'Утеплить кровлю', description: 'Минвата 200 мм, пароизоляция.', object_id: depot, assignee_id: W1 },
	{ title: 'Установить ворота', description: 'Секционные ворота 4×4 м, 2 шт.', object_id: depot, assignee_id: W1 },
	{ title: 'Покрасить фасад', description: 'Цвет RAL 9010, два слоя.', object_id: cottage, assignee_id: W2 },
	{ title: 'Завезти кирпич', description: 'Облицовочный, 6000 шт.', object_id: cottage, assignee_id: W1 },
]).select(), 'задачи');

const t = Object.fromEntries(tasks.map((x) => [x.title, x.id]));
async function move(client, title, to, comment) {
	check(await client.rpc('change_task_status', { p_task_id: t[title], p_to: to, p_comment: comment ?? null }), `${title} → ${to}`);
}

// «Залить фундамент» — полный цикл с доработкой, итог: Принята
await move(w1, 'Залить фундамент секции А', 'in_progress');
await move(w1, 'Залить фундамент секции А', 'review');
await move(manager, 'Залить фундамент секции А', 'rework', 'Нет фото опалубки перед заливкой, приложите.');
await move(w1, 'Залить фундамент секции А', 'in_progress');
await move(w1, 'Залить фундамент секции А', 'review', 'Фото добавил в папку объекта.');
await move(manager, 'Залить фундамент секции А', 'accepted');
// «Леса» — В работе
await move(w2, 'Смонтировать леса на фасаде', 'in_progress');
// «Кабель» — На проверке
await move(w1, 'Проложить кабель освещения', 'in_progress');
await move(w1, 'Проложить кабель освещения', 'review');
// «Кровля» — На доработке
await move(w1, 'Утеплить кровлю', 'in_progress');
await move(w1, 'Утеплить кровлю', 'review');
await move(manager, 'Утеплить кровлю', 'rework', 'Пароизоляция уложена без нахлёста, переделать.');
// «Ворота», «Фасад», «Кирпич» остаются Новыми

console.log('Готово: 3 пользователя, 3 объекта, 7 задач.');
