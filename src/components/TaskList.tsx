import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { formatDate } from '../lib/status';
import type { Task } from '../lib/types';

interface Props {
	tasks: Task[];
	showObject?: boolean;
	empty: string;
}

export default function TaskList({ tasks, showObject = false, empty }: Props) {
	if (tasks.length === 0) return <p className="muted">{empty}</p>;
	return (
		<ul className="list">
			{tasks.map((t) => (
				<li key={t.id}>
					<Link to={`/tasks/${t.id}`} className="card card--link task-row">
						<div className="task-row__main">
							<strong>{t.title}</strong>
							<span className="muted small">
								{showObject && t.object && <>{t.object.name} · </>}
								{t.assignee?.full_name ?? '—'} · {formatDate(t.created_at)}
							</span>
						</div>
						<StatusBadge status={t.status} />
					</Link>
				</li>
			))}
		</ul>
	);
}
