import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ReactNode } from 'react';
import './workspace.css';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardQueryKey,
  getGetTaskQueryKey,
  getListCategoriesQueryKey,
  getListTasksQueryKey,
  useCreateCategory,
  useCreateTask,
  useDeleteCategory,
  useDeleteTask,
  useDuplicateTask,
  useGetDashboard,
  useGetTask,
  useListCategories,
  useListTasks,
  useUpdateCategory,
  useUpdateTask,
} from '@workspace/api-client-react';
import type { ListTasksParams, Task, TaskInput, TaskPriority } from '@workspace/api-client-react';
import {
  AlarmClock,
  ArrowDownWideNarrow,
  ArrowUpDown,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  ClipboardList,
  Clock3,
  Folder,
  ListFilter,
  LoaderCircle,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

type ListMode = 'all' | 'active' | 'today' | 'upcoming' | 'completed';
type DialogMode = 'create' | 'edit';

const priorityNames: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};

const dateInputValue = (date?: string | null) => date ? date.slice(0, 10) : '';
const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const prettyDate = (date?: string | null) => {
  if (!date) return '';
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const isOverdue = (date?: string | null) => Boolean(date && date.slice(0, 10) < localDateKey());

export default function Workspace() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ListMode>('all');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [dueFilter, setDueFilter] = useState<NonNullable<ListTasksParams['due']> | ''>('');
  const [tagFilter, setTagFilter] = useState('');
  const [sort, setSort] = useState<'createdAt' | 'dueDate' | 'priority' | 'title' | 'completed'>('createdAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [quickTitle, setQuickTitle] = useState('');
  const [dialog, setDialog] = useState<{ mode: DialogMode; taskId?: string } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [themeDark, setThemeDark] = useState(false);
  const [notice, setNotice] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('daymark-theme') === 'dark';
    setThemeDark(saved);
    document.documentElement.classList.toggle('dark', saved);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === 'Escape') {
        if (dialog) setDialog(null);
        else if (manageOpen) setManageOpen(false);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || dialog || manageOpen) return;
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setDialog({ mode: 'create' });
      } else if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, manageOpen]);

  const today = localDateKey();
  const selectedDue = dueFilter || (mode === 'today' ? 'today' : mode === 'upcoming' ? 'upcoming' : undefined);
  const params = useMemo<ListTasksParams>(() => ({
    search: search.trim() || undefined,
    status: mode === 'completed' ? 'completed' : mode === 'active' || mode === 'today' || mode === 'upcoming' ? 'active' : 'all',
    categoryId: categoryId || undefined,
    priority: priority ? priority as ListTasksParams['priority'] : undefined,
    tag: tagFilter || undefined,
    due: selectedDue,
    today,
    sort,
    direction,
  }), [search, mode, categoryId, priority, tagFilter, selectedDue, today, sort, direction]);

  const tasksQuery = useListTasks(params);
  const categoriesQuery = useListCategories();
  const dashboardQuery = useGetDashboard({ today });
  const tasks = tasksQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const dashboard = dashboardQuery.data;

  const refreshWorkspace = () => {
    void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const duplicateTask = useDuplicateTask();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const doQuickCreate = (event: FormEvent) => {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title || createTask.isPending) return;
    createTask.mutate({ data: { title, priority: 'none', categoryId: categoryId || null } }, {
      onSuccess: () => {
        setQuickTitle('');
        refreshWorkspace();
        setNotice('Added to your list');
      },
      onError: () => setNotice('Could not save that task'),
    });
  };

  const toggleTask = (task: Task) => {
    updateTask.mutate({ taskId: task.id, data: { completed: !task.completed } }, {
      onSuccess: () => {
        refreshWorkspace();
        setNotice(task.completed ? 'Back on your list' : 'Nicely done');
      },
      onError: () => setNotice('Could not update that task'),
    });
  };
  const removeTask = (task: Task) => {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    deleteTask.mutate({ taskId: task.id }, {
      onSuccess: () => {
        refreshWorkspace();
        setNotice('Task removed');
      },
      onError: () => setNotice('Could not remove that task'),
    });
  };
  const duplicate = (task: Task) => duplicateTask.mutate({ taskId: task.id }, {
    onSuccess: () => {
      refreshWorkspace();
      setNotice('A copy is ready');
    },
    onError: () => setNotice('Could not make a copy'),
  });
  const toggleTheme = () => {
    const next = !themeDark;
    setThemeDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('daymark-theme', next ? 'dark' : 'light');
  };
  const chooseMode = (nextMode: ListMode) => {
    setMode(nextMode);
    setCategoryId('');
    setDueFilter('');
  };

  const tagOptions = [...new Set([...tasks.flatMap((task) => task.tags ?? []), ...(tagFilter ? [tagFilter] : [])])].sort((a, b) => a.localeCompare(b));
  const activeFilterLabels = [
    search.trim() ? `Search: ${search.trim()}` : '',
    mode === 'active' ? 'Active tasks' : mode === 'completed' ? 'Completed tasks' : mode === 'today' ? 'Due today' : mode === 'upcoming' ? 'Upcoming' : '',
    categoryId ? categories.find((category) => category.id === categoryId)?.name ?? 'Category' : '',
    priority ? `${priorityNames[priority as TaskPriority]} priority` : '',
    tagFilter ? `Tag: ${tagFilter}` : '',
    dueFilter ? `Due: ${dueFilter === 'none' ? 'No date' : dueFilter}` : '',
  ].filter(Boolean);
  const hasActiveFilters = activeFilterLabels.length > 0;
  const clearFilters = () => {
    setSearch('');
    setPriority('');
    setTagFilter('');
    setDueFilter('');
    setCategoryId('');
    setMode('all');
  };

  const heading = categoryId
    ? categories.find((category) => category.id === categoryId)?.name ?? 'Category'
    : mode === 'active' ? 'Active tasks' : mode === 'today' ? 'Today' : mode === 'upcoming' ? 'Coming up' : mode === 'completed' ? 'Finished' : 'My tasks';

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="workspace-frame">
        <aside className="sidebar" aria-label="Task navigation">
          <div className="brand-lockup">
            <div className="brand-mark"><CheckCheck size={18} strokeWidth={2.2} /></div>
            <div><div className="brand-name">daymark</div><div className="brand-caption">A little room to focus</div></div>
          </div>

          <button className="new-task-button" onClick={() => setDialog({ mode: 'create' })} data-testid="button-new-task">
            <Plus size={17} /> <span>New task</span><span className="shortcut">N</span>
          </button>
          <button className="mobile-manage-categories" onClick={() => setManageOpen(true)} aria-label="Manage categories" data-testid="button-manage-categories-mobile"><SlidersHorizontal size={16} /></button>

          <div className="nav-label">YOUR SPACE</div>
          <nav className="nav-stack">
            <button className={`nav-item ${mode === 'all' && !categoryId ? 'selected' : ''}`} onClick={() => chooseMode('all')} data-testid="nav-all-tasks">
              <ClipboardList size={17} /><span>All tasks</span><span className="nav-count">{dashboard?.active ?? '—'}</span>
            </button>
            <button className={`nav-item ${mode === 'active' ? 'selected' : ''}`} onClick={() => chooseMode('active')} data-testid="nav-active-tasks">
              <Circle size={17} /><span>Active tasks</span><span className="nav-count">{dashboard?.active ?? '—'}</span>
            </button>
            <button className={`nav-item ${mode === 'today' ? 'selected' : ''}`} onClick={() => chooseMode('today')} data-testid="nav-today">
              <Sun size={17} /><span>Today</span>{dashboard?.dueToday ? <span className="nav-count">{dashboard.dueToday}</span> : null}
            </button>
            <button className={`nav-item ${mode === 'upcoming' ? 'selected' : ''}`} onClick={() => chooseMode('upcoming')} data-testid="nav-upcoming">
              <Clock3 size={17} /><span>Coming up</span>
            </button>
            <button className={`nav-item ${mode === 'completed' ? 'selected' : ''}`} onClick={() => chooseMode('completed')} data-testid="nav-completed">
              <Check size={17} /><span>Finished</span><span className="nav-count">{dashboard?.completed ?? '—'}</span>
            </button>
          </nav>

          <div className="category-head">
            <div className="nav-label">CATEGORIES</div>
            <button aria-label="Manage categories" className="icon-button small" onClick={() => setManageOpen(true)} data-testid="button-manage-categories"><SlidersHorizontal size={15} /></button>
          </div>
          {categoriesQuery.isLoading ? (
            <div className="side-loading"><span className="skeleton-dot" /><span className="skeleton-line" /></div>
          ) : categories.length ? (
            <nav className="nav-stack category-nav">
              {categories.map((category, index) => (
                <button key={category.id} className={`nav-item category-item ${categoryId === category.id ? 'selected' : ''}`} onClick={() => { setCategoryId(category.id); setMode('all'); }} data-testid={`nav-category-${category.id}`}>
                  <span className={`category-dot dot-${index % 5}`} /><span className="category-title">{category.name}</span>
                </button>
              ))}
            </nav>
          ) : <p className="category-hint">{categoriesQuery.isError ? 'Categories could not load.' : 'Make a category for the things you return to.'}</p>}

          <div className="sidebar-bottom">
            <div className="quote-card">
              <span className="quote-spark"><Sparkles size={14} /></span>
              <p>Small steps still move you forward.</p>
              <span className="quote-byline">A NOTE FOR TODAY</span>
            </div>
            <button className="theme-switch" onClick={toggleTheme} aria-label={`Switch to ${themeDark ? 'light' : 'dark'} theme`} data-testid="button-theme">
              <span className="theme-icon">{themeDark ? <Moon size={16} /> : <Sun size={16} />}</span>
              <span>{themeDark ? 'Night palette' : 'Day palette'}</span>
              <span className={`toggle-track ${themeDark ? 'on' : ''}`}><span /></span>
            </button>
            <div className="sidebar-footer">Made for your everyday</div>
          </div>
        </aside>

        <section className="main-panel">
          <header className="topbar">
            <div className="breadcrumb"><span>MY SPACE</span><span className="crumb-sep">/</span><span>{heading.toUpperCase()}</span></div>
            <div className="topbar-actions">
              <label className="search-field">
                <Search size={16} />
                <input ref={searchInputRef} aria-label="Search tasks" placeholder="Find a task..." value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search" />
                {search && <button aria-label="Clear search" onClick={() => setSearch('')} type="button" className="clear-search"><X size={13} /></button>}
                {!search && <kbd>/</kbd>}
              </label>
              <button className="mobile-theme icon-button" aria-label="Toggle theme" onClick={toggleTheme} data-testid="button-theme-mobile">{themeDark ? <Moon size={17} /> : <Sun size={17} />}</button>
            </div>
          </header>

          <div className="content-wrap">
            <section className="welcome-row animate-rise">
              <div>
                <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div>
                <h1>{heading}<span className="heading-period">.</span></h1>
                <p className="welcome-subtitle">{mode === 'today' ? 'A clear view of what matters today.' : 'Make space for what matters, one thing at a time.'}</p>
              </div>
              <div className="welcome-doodle" aria-hidden="true">
                <div className="doodle-sun" />
                <div className="doodle-line line-one" /><div className="doodle-line line-two" />
                <span className="doodle-word">one thing<br />at a time</span>
              </div>
            </section>

            <section className="progress-strip animate-rise" aria-label="Progress summary">
              <div className="progress-intro">
                <span className="progress-icon"><Sparkles size={16} /></span>
                <div><div className="progress-kicker">YOUR MOMENTUM</div><div className="progress-label">{dashboardQuery.isError ? 'Progress is temporarily unavailable' : dashboard ? `${dashboard.completionPercentage}% of your list is complete` : 'Getting your progress...'}</div></div>
              </div>
              <div className="progress-track" role="progressbar" aria-valuenow={dashboard?.completionPercentage ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Completion percentage">
                <span style={{ width: `${Math.min(100, dashboard?.completionPercentage ?? 0)}%` }} />
              </div>
              <div className="progress-count"><b>{dashboard?.completed ?? '—'}</b><span>of {dashboard?.total ?? '—'} done</span></div>
            </section>

            <section className="summary-grid" aria-label="Task summary">
              <SummaryMetric label="In motion" value={dashboard?.active} icon={<Circle size={16} />} tone="green" loading={dashboardQuery.isLoading} />
              <SummaryMetric label="Due today" value={dashboard?.dueToday} icon={<AlarmClock size={16} />} tone="peach" loading={dashboardQuery.isLoading} />
              <SummaryMetric label="Past due" value={dashboard?.overdue} icon={<Clock3 size={16} />} tone="rose" loading={dashboardQuery.isLoading} />
              <SummaryMetric label="High priority" value={dashboard?.highPriority} icon={<Sparkles size={16} />} tone="yellow" loading={dashboardQuery.isLoading} />
            </section>

            <section className="task-section">
              <div className="task-toolbar">
                <div className="section-title-wrap"><h2>{heading}</h2><span className="task-total">{tasks.length}</span></div>
                <div className="toolbar-tools">
                  <label className="filter-select-wrap"><Folder size={14} /><select aria-label="Filter by category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} data-testid="select-category-filter">
                    <option value="">Any category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select><ChevronDown size={13} /></label>
                  <label className="filter-select-wrap"><ListFilter size={14} /><select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)} data-testid="select-priority">
                    <option value="">Any priority</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option><option value="none">No priority</option>
                  </select><ChevronDown size={13} /></label>
                  <label className="filter-select-wrap"><Clock3 size={14} /><select aria-label="Filter by due date" value={dueFilter} onChange={(event) => { setDueFilter(event.target.value as typeof dueFilter); setMode('all'); }} data-testid="select-due-filter">
                    <option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="tomorrow">Due tomorrow</option><option value="upcoming">Upcoming</option><option value="none">No due date</option>
                  </select><ChevronDown size={13} /></label>
                  <label className="filter-select-wrap"><Tag size={14} /><select aria-label="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} data-testid="select-tag-filter">
                    <option value="">Any tag</option>{tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select><ChevronDown size={13} /></label>
                  <label className="filter-select-wrap sort-select"><ArrowDownWideNarrow size={14} /><select aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} data-testid="select-sort">
                    <option value="createdAt">Recently added</option><option value="dueDate">Due date</option><option value="priority">Priority</option><option value="title">Title</option><option value="completed">Completion</option>
                  </select><ChevronDown size={13} /></label>
                  <button className="sort-direction icon-button" aria-label={`Sort ${direction === 'asc' ? 'descending' : 'ascending'}`} onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')} data-testid="button-sort-direction"><ArrowUpDown size={16} /></button>
                </div>
              </div>
              {hasActiveFilters && <div className="active-filter-bar" aria-live="polite"><span className="active-filter-label">FILTERED BY</span>{activeFilterLabels.map((label) => <span className="active-filter-chip" key={label}>{label}</span>)}<button className="filter-clear-button" onClick={clearFilters} data-testid="button-clear-active-filters">Clear all</button></div>}

              <form className="quick-add" onSubmit={doQuickCreate}>
                <span className="quick-add-plus"><Plus size={17} /></span>
                <input aria-label="Quick add a task" placeholder="What’s on your mind?" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} maxLength={180} data-testid="input-quick-task" />
                <button type="button" className="quick-details" onClick={() => setDialog({ mode: 'create' })} aria-label="Add task with details" data-testid="button-task-details"><SlidersHorizontal size={16} /></button>
                <button type="submit" className="quick-submit" disabled={!quickTitle.trim() || createTask.isPending} data-testid="button-quick-add">{createTask.isPending ? <LoaderCircle className="spin" size={15} /> : 'Add'}</button>
              </form>
              {createTask.isError && <div className="inline-error" role="alert">That task could not be saved. Please try again.</div>}

              {tasksQuery.isLoading ? (
                <div className="task-skeleton-list" aria-label="Loading tasks">
                  {[0, 1, 2, 3].map((item) => <div className="task-skeleton" key={item}><span className="skeleton-check" /><div><span className="skeleton-line long" /><span className="skeleton-line short" /></div></div>)}
                </div>
              ) : tasksQuery.isError ? (
                <div className="state-card error-state">
                  <div className="state-mark"><X size={20} /></div><h3>Your list didn’t load</h3><p>Something interrupted the connection. Your tasks are safe; try again.</p>
                  <button className="outline-button" onClick={() => { void tasksQuery.refetch(); void dashboardQuery.refetch(); }} data-testid="button-retry">Try again</button>
                </div>
              ) : tasks.length ? (
                <div className="task-list" role="list">
                  {tasks.map((task, index) => <TaskRow key={task.id} task={task} index={index} onToggle={() => toggleTask(task)} onEdit={() => setDialog({ mode: 'edit', taskId: task.id })} onDuplicate={() => duplicate(task)} onDelete={() => removeTask(task)} busy={updateTask.isPending || duplicateTask.isPending || deleteTask.isPending} />)}
                </div>
              ) : (
                <div className="state-card empty-state">
                  <div className="empty-illustration"><div className="empty-sun" /><div className="empty-page"><span /><span /><span /></div><div className="empty-check"><Check size={17} /></div></div>
                  <div className="empty-eyebrow">{hasActiveFilters ? 'NOTHING MATCHES JUST YET' : 'A BREATHING SPACE'}</div>
                  <h3>{hasActiveFilters ? 'No tasks found' : mode === 'completed' ? 'Your next little win is waiting' : mode === 'today' ? 'A little room in your day' : 'Start with one small thing'}</h3>
                  <p>{hasActiveFilters ? 'Try a different search or clear a filter to see more.' : mode === 'completed' ? 'Finished tasks will gather here. Pick one thing to begin.' : 'Capture it here, and let your mind move on.'}</p>
                  {hasActiveFilters ? <button className="outline-button" onClick={clearFilters} data-testid="button-clear-filters">Clear filters</button> : mode !== 'completed' && <button className="outline-button" onClick={() => setDialog({ mode: 'create' })} data-testid="button-empty-create"><Plus size={15} /> Create a task</button>}
                </div>
              )}
              <div className="list-footer"><span className="footer-rule" />{tasks.length ? `A good day is made of small things.` : 'Take your time. Your list will be here.'}<span className="footer-rule" /></div>
            </section>
          </div>
        </section>
      </div>

      {dialog && <TaskDialog mode={dialog.mode} taskId={dialog.taskId} categories={categories} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refreshWorkspace(); setNotice(dialog.mode === 'create' ? 'Task saved' : 'Changes saved'); }} />}
      {manageOpen && <CategoryManager categories={categories} onClose={() => setManageOpen(false)} onChanged={() => { void queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); refreshWorkspace(); }} />}
      {notice && <div className={`toast-note ${notice.startsWith('Could not') ? 'is-error' : ''}`} role="status"><span className="toast-check">{notice.startsWith('Could not') ? <X size={14} /> : <Check size={14} />}</span>{notice}</div>}
    </main>
  );
}

function SummaryMetric({ label, value, icon, tone, loading }: { label: string; value?: number; icon: ReactNode; tone: string; loading: boolean }) {
  return <div className="summary-metric"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-data">{loading ? <span className="skeleton-line metric-skeleton" /> : <strong>{value ?? 0}</strong>}<span>{label}</span></div></div>;
}

function TaskRow({ task, index, onToggle, onEdit, onDuplicate, onDelete, busy }: { task: Task; index: number; onToggle: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; busy: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <article className={`task-row ${task.completed ? 'is-complete' : ''} animate-rise`} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }} role="listitem" data-testid={`task-row-${task.id}`}>
      <button className={`check-ring ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? `Mark ${task.title} active` : `Complete ${task.title}`} onClick={onToggle} disabled={busy} data-testid={`button-complete-${task.id}`}>
        {task.completed && <Check size={14} strokeWidth={2.6} />}
      </button>
      <button className="task-copy" onClick={() => setDetailsOpen(!detailsOpen)} aria-expanded={detailsOpen} data-testid={`button-expand-${task.id}`}>
        <span className="task-title">{task.title}</span>
        {task.description && <span className={`task-description ${detailsOpen ? 'expanded' : ''}`}>{task.description}</span>}
        {detailsOpen && <span className="task-expanded-detail">Added {new Date(task.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{task.updatedAt !== task.createdAt ? ` · Updated ${new Date(task.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}{task.tags?.length ? ` · ${task.tags.length} ${task.tags.length === 1 ? 'tag' : 'tags'}` : ''}</span>}
        <span className="task-meta">
          {task.categoryName && <span className="task-category"><Folder size={12} />{task.categoryName}</span>}
          {task.dueDate && <span className={`task-date ${isOverdue(task.dueDate) && !task.completed ? 'overdue' : ''}`}><Clock3 size={12} />{isOverdue(task.dueDate) && !task.completed ? 'Overdue · ' : ''}{prettyDate(task.dueDate)}</span>}
          {task.tags?.slice(0, 2).map((tag) => <span className="task-tag" key={tag}><Tag size={10} />{tag}</span>)}
          {task.tags?.length > 2 && <span className="task-tag">+{task.tags.length - 2}</span>}
          {task.priority !== 'none' && <span className={`priority-pill priority-${task.priority}`}><span />{priorityNames[task.priority]}</span>}
        </span>
      </button>
      <div className="task-actions">
        <button className="row-action" onClick={onEdit} aria-label={`Edit ${task.title}`} data-testid={`button-edit-${task.id}`}><SlidersHorizontal size={15} /></button>
        <div className="menu-anchor">
          <button className="row-action more-button" aria-label={`More actions for ${task.title}`} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} data-testid={`button-more-${task.id}`}><MoreHorizontal size={17} /></button>
          {menuOpen && <><button className="menu-dismiss" aria-label="Close task menu" onClick={() => setMenuOpen(false)} /><div className="action-menu">
            <button onClick={() => { setMenuOpen(false); onEdit(); }}><SlidersHorizontal size={14} />Edit details</button>
            <button onClick={() => { setMenuOpen(false); onDuplicate(); }}><ClipboardList size={14} />Make a copy</button>
            <button className="danger-action" onClick={() => { setMenuOpen(false); onDelete(); }}><Trash2 size={14} />Delete task</button>
          </div></>}
        </div>
      </div>
    </article>
  );
}

function TaskDialog({ mode, taskId, categories, onClose, onSaved }: { mode: DialogMode; taskId?: string; categories: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const taskQuery = useGetTask(taskId ?? '', { query: { enabled: Boolean(taskId), queryKey: getGetTaskQueryKey(taskId ?? '') } });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (mode === 'create') {
      setInitialized(true);
      return;
    }
    const task = taskQuery.data;
    if (!task || initialized) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setDueDate(dateInputValue(task.dueDate));
    setCategoryId(task.categoryId ?? '');
    setTags(task.tags?.join(', ') ?? '');
    setInitialized(true);
  }, [mode, taskQuery.data, initialized]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const data: TaskInput = {
      title: cleanTitle,
      description: description.trim() || null,
      priority,
      dueDate: dueDate || null,
      categoryId: categoryId || null,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    };
    if (mode === 'create') {
      createTask.mutate({ data }, { onSuccess: () => { onSaved(); } });
    } else if (taskId) {
      updateTask.mutate({ taskId, data }, {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
          onSaved();
        },
      });
    }
  };
  const pending = createTask.isPending || updateTask.isPending;
  const loadError = mode === 'edit' && taskQuery.isError;
  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-dialog animate-rise" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
        <header className="dialog-header">
          <div><div className="dialog-eyebrow">{mode === 'create' ? 'CAPTURE A THOUGHT' : 'A LITTLE TIDY-UP'}</div><h2 id="task-dialog-title">{mode === 'create' ? 'New task' : 'Edit task'}</h2></div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose} data-testid="button-close-task-dialog"><X size={18} /></button>
        </header>
        {mode === 'edit' && taskQuery.isLoading ? <div className="dialog-loading"><span className="skeleton-line long" /><span className="skeleton-line" /><span className="skeleton-line long" /></div> : loadError ? (
          <div className="dialog-error"><p>We couldn't load this task.</p><button className="outline-button" onClick={() => void taskQuery.refetch()} data-testid="button-retry-task">Try again</button></div>
        ) : <form onSubmit={submit} className="task-form">
          <label className="field-label">Task name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required placeholder="Give it a clear name" data-testid="input-task-title" /></label>
          <label className="field-label">A few details <span className="optional-label">OPTIONAL</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="Anything useful to remember..." data-testid="input-task-description" /></label>
          <div className="form-pair">
            <label className="field-label">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} data-testid="select-task-priority"><option value="none">No priority</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label className="field-label">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} data-testid="input-task-due" /></label>
          </div>
          <label className="field-label">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} data-testid="select-task-category"><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field-label">Tags <span className="optional-label">COMMA SEPARATED</span><input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={400} placeholder="planning, personal, later" data-testid="input-task-tags" /></label>
          {(createTask.isError || updateTask.isError) && <p className="form-error" role="alert">Couldn't save this task. Check your connection and try again.</p>}
          <div className="dialog-footer"><button type="button" className="text-button" onClick={onClose} data-testid="button-cancel-task">Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || pending} data-testid="button-save-task">{pending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{pending ? 'Saving…' : 'Save task'}</button></div>
        </form>}
      </section>
    </div>
  );
}

function CategoryManager({ categories, onClose, onChanged }: { categories: { id: string; name: string }[]; onClose: () => void; onChanged: () => void }) {
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const add = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createCategory.mutate({ data: { name } }, { onSuccess: () => { setNewName(''); setError(''); onChanged(); }, onError: () => setError('Could not create category. Try another name.') });
  };
  const saveRename = (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    updateCategory.mutate({ categoryId: id, data: { name } }, { onSuccess: () => { setRenaming(null); onChanged(); }, onError: () => setError('Could not rename this category.') });
  };
  const remove = (category: { id: string; name: string }) => {
    if (!window.confirm(`Delete the “${category.name}” category? Its tasks will stay, uncategorized.`)) return;
    deleteCategory.mutate({ categoryId: category.id }, { onSuccess: () => { onChanged(); }, onError: () => setError('Could not delete that category.') });
  };
  const busy = createCategory.isPending || updateCategory.isPending || deleteCategory.isPending;
  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="category-dialog animate-rise" role="dialog" aria-modal="true" aria-labelledby="category-title">
        <header className="dialog-header"><div><div className="dialog-eyebrow">KEEP THINGS IN THEIR PLACE</div><h2 id="category-title">Categories</h2></div><button className="icon-button" aria-label="Close categories" onClick={onClose} data-testid="button-close-categories"><X size={18} /></button></header>
        <form className="category-create" onSubmit={add}><input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={60} placeholder="Name a category" aria-label="New category name" data-testid="input-category-name" /><button className="primary-button" type="submit" disabled={!newName.trim() || busy} data-testid="button-add-category"><Plus size={15} />Add</button></form>
        <div className="category-manage-list">
          {categories.length ? categories.map((category, index) => <div className="manage-category-row" key={category.id}>
            <span className={`category-dot dot-${index % 5}`} />
            {renaming === category.id ? <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveRename(category.id); if (event.key === 'Escape') setRenaming(null); }} aria-label={`Rename ${category.name}`} data-testid={`input-rename-${category.id}`} /> : <span className="manage-category-name">{category.name}</span>}
            {renaming === category.id ? <button className="row-action" aria-label="Save category name" onClick={() => saveRename(category.id)} disabled={busy} data-testid={`button-save-category-${category.id}`}><Check size={15} /></button> : <button className="text-button category-rename" onClick={() => { setRenaming(category.id); setRenameValue(category.name); }} data-testid={`button-rename-category-${category.id}`}>Rename</button>}
            <button className="row-action danger-icon" aria-label={`Delete ${category.name}`} onClick={() => remove(category)} disabled={busy} data-testid={`button-delete-category-${category.id}`}><Trash2 size={14} /></button>
          </div>) : <div className="category-empty"><Folder size={20} /><span>No categories yet. Start with one that feels useful.</span></div>}
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="dialog-footer"><button className="text-button" onClick={onClose} data-testid="button-done-categories">Done</button></div>
      </section>
    </div>
  );
}