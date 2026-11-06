// Проверка безопасности в обход интерфейса: шлём запросы в Supabase напрямую
// с публичным ключом (как мог бы сделать любой пользователь из консоли браузера)
// и убеждаемся, что база отказывает. Данные не меняются: все «атаки» должны провалиться.
// Запуск после npm run db:seed:  npm run test:security
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const password = process.env.SEED_PASSWORD;
if (!url || !anonKey || !password) {
	console.error('Нужны VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY и SEED_PASSWORD в .env');
	process.exit(1);
}

const newClient = () => createClient(url, anonKey, { auth: { persistSession: false } });
async function signIn(email) {
	const c = newClient();
	const { data, error } = await c.auth.signInWithPassword({ email, password });
	if (error) throw new Error(`${email}: ${error.message}`);
	return { c, id: data.user.id };
}

let failed = 0;
async function test(name, fn) {
	try {
		const ok = await fn();
		console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
		if (!ok) failed++;
	} catch (e) {
		console.log(`FAIL ${name}: ${e.message}`);
		failed++;
	}
}

const anon = newClient();
const { c: manager, id: managerId } = await signIn('manager@crm-demo.test');
const { c: w1, id: w1Id } = await signIn('worker1@crm-demo.test');
const { c: w2, id: w2Id } = await signIn('worker2@crm-demo.test');

// Опорные данные глазами постановщика
const { data: allTasks } = await manager.from('tasks').select('id, title, status, assignee_id, object_id');
const { data: allObjects } = await manager.from('objects').select('id, name');
const w1New = allTasks.find((t) => t.assignee_id === w1Id && t.status === 'new');
const w1Review = allTasks.find((t) => t.assignee_id === w1Id && t.status === 'review');
const w2Task = allTasks.find((t) => t.assignee_id === w2Id);
const w2ObjectIds = new Set(allTasks.filter((t) => t.assignee_id === w2Id).map((t) => t.object_id));
const objectWithoutW2 = allObjects.find((o) => !w2ObjectIds.has(o.id));

console.log('— Без входа в систему');
await test('аноним не видит объекты, задачи и историю', async () => {
	const a = await anon.from('objects').select('id');
	const b = await anon.from('tasks').select('id');
	const c = await anon.from('task_history').select('id');
	return [a, b, c].every((r) => r.error || r.data.length === 0);
});
await test('открытая регистрация отключена', async () => {
	const { data, error } = await newClient().auth.signUp({ email: `hacker${Date.now()}@crm-demo.test`, password: 'Qwerty12345!' });
	return Boolean(error) && !data.user;
});

console.log('— Исполнитель: чтение');
await test('видит только свои задачи', async () => {
	const { data } = await w1.from('tasks').select('assignee_id');
	return data.length > 0 && data.every((t) => t.assignee_id === w1Id);
});
await test('чужую задачу не получить даже по id', async () => {
	const { data } = await w1.from('tasks').select('id').eq('id', w2Task.id);
	return data.length === 0;
});
await test('не видит историю чужой задачи', async () => {
	const { data } = await w1.from('task_history').select('id').eq('task_id', w2Task.id);
	return data.length === 0;
});
await test('видит только объекты, где у него есть задачи', async () => {
	const { data } = await w2.from('objects').select('id');
	return data.length === w2ObjectIds.size && data.every((o) => w2ObjectIds.has(o.id))
		&& objectWithoutW2 && !data.some((o) => o.id === objectWithoutW2.id);
});

console.log('— Исполнитель: изменения');
await test('не может изменить чужую задачу', async () => {
	const { data } = await w1.from('tasks').update({ title: 'взлом' }).eq('id', w2Task.id).select();
	return !data || data.length === 0;
});
await test('не может изменить поля своей задачи', async () => {
	const { data } = await w1.from('tasks').update({ title: 'взлом' }).eq('id', w1New.id).select();
	return !data || data.length === 0;
});
await test('не может поменять статус прямым запросом', async () => {
	const { error } = await w1.from('tasks').update({ status: 'accepted' }).eq('id', w1New.id);
	return Boolean(error);
});
await test('не может перескочить статус (Новая → Принята)', async () => {
	const { error } = await w1.rpc('change_task_status', { p_task_id: w1New.id, p_to: 'accepted' });
	return Boolean(error);
});
await test('не может сам принять свою задачу на проверке', async () => {
	const { error } = await w1.rpc('change_task_status', { p_task_id: w1Review.id, p_to: 'accepted' });
	return Boolean(error);
});
await test('не может двигать статус чужой задачи', async () => {
	const { error } = await w1.rpc('change_task_status', { p_task_id: w2Task.id, p_to: 'in_progress' });
	return Boolean(error);
});
await test('не может создать объект или задачу', async () => {
	const a = await w1.from('objects').insert({ name: 'взлом' }).select();
	const b = await w1.from('tasks').insert({ title: 'взлом', object_id: w2Task.object_id, assignee_id: w1Id }).select();
	return Boolean(a.error) && Boolean(b.error);
});
await test('не может удалить задачу', async () => {
	const { data } = await w1.from('tasks').delete().eq('id', w1New.id).select();
	return !data || data.length === 0;
});
await test('не может повысить себе роль', async () => {
	const { data, error } = await w1.from('profiles').update({ role: 'manager' }).eq('id', w1Id).select();
	return Boolean(error) || data.length === 0;
});

await test('служебные функции не вызываются через API', async () => {
	const { error } = await w1.rpc('is_manager');
	return Boolean(error);
});

console.log('— Постановщик');
await test('не может поменять статус прямым запросом', async () => {
	const { error } = await manager.from('tasks').update({ status: 'accepted' }).eq('id', w1Review.id);
	return Boolean(error);
});
await test('не может создать задачу сразу в статусе «Принята»', async () => {
	const { error } = await manager.from('tasks')
		.insert({ title: 'взлом', object_id: w1New.object_id, assignee_id: w1Id, status: 'accepted' });
	return Boolean(error);
});
await test('не может вернуть на доработку без комментария', async () => {
	const { error } = await manager.rpc('change_task_status', { p_task_id: w1Review.id, p_to: 'rework', p_comment: '   ' });
	return Boolean(error);
});
await test('не может взять задачу в работу за исполнителя', async () => {
	const { error } = await manager.rpc('change_task_status', { p_task_id: w1New.id, p_to: 'in_progress' });
	return Boolean(error);
});
await test('не может назначить исполнителем постановщика', async () => {
	const { error } = await manager.from('tasks').update({ assignee_id: managerId }).eq('id', w1New.id);
	return Boolean(error);
});

console.log('— История статусов');
await test('историю нельзя добавить, изменить или удалить через API', async () => {
	const { data: h } = await manager.from('task_history').select('id').limit(1);
	const ins = await manager.from('task_history')
		.insert({ task_id: w1New.id, changed_by: managerId, to_status: 'accepted' });
	const upd = await manager.from('task_history').update({ comment: 'подделка' }).eq('id', h[0].id);
	const del = await manager.from('task_history').delete().eq('id', h[0].id);
	return Boolean(ins.error) && Boolean(upd.error) && Boolean(del.error);
});

console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе проверки пройдены.');
process.exit(failed ? 1 : 0);
