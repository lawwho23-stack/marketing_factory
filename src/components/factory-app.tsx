"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Film,
  FolderOpen,
  Home,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { PixelOffice, type OfficeWorker } from "./pixel-office";
import { type ScriptPackage } from "@/lib/domain";

type Task = {
  id: string;
  title: string;
  description: string;
  worker_id: string;
  status: string;
  source: string;
  updated_at: string;
  current_run_id: string | null;
};
type Artifact = {
  id: string;
  task_id: string;
  run_id: string | null;
  title: string;
  type: string;
  sha256: string;
  review_status: string;
  review_note: string | null;
  drive_url: string | null;
  content_json: ScriptPackage | null;
  created_at: string;
  delivery_status?: string;
  delivery_job_id?: string;
  delivery_error?: string;
};
type Lead = {
  id: string;
  name: string;
  company: string;
  contact: string;
  source: string;
  stage: string;
  next_follow_up: string | null;
  notes: string;
  campaign_id: string | null;
};
type Transaction = {
  id: string;
  type: string;
  amount: string;
  currency: string;
  category: string;
  transaction_date: string;
  note: string;
  campaign_id: string | null;
  lead_id: string | null;
};
type Campaign = {
  id: string;
  name: string;
  audience: string;
  goal: string;
  tasks: number;
};
type EventItem = {
  event_id: string;
  event_type: string;
  step_id?: string;
  message: string;
  received_at: string;
  title?: string;
  worker_id?: string;
};
type Delivery = {
  id: string;
  status: string;
  error: string | null;
  attempts: number;
  title: string;
  task_id: string;
};
type Snapshot = {
  lead_stage_counts: Record<string, number>;
  workers: OfficeWorker[];
  tasks: Task[];
  artifacts: Artifact[];
  leads: Lead[];
  finance: {
    currency: string;
    income: string;
    expense: string;
    balance: string;
  }[];
  events: EventItem[];
  campaigns: Campaign[];
  delivery: Delivery[];
  generated_at: string;
  database: string;
  integrations: {
    drive_connected: boolean;
    google_configured: boolean;
    bridge_configured: boolean;
    storage_configured: boolean;
    worker_last_seen: string | null;
  };
  counts: { active: number; review: number; completed: number; leads: number };
};
type Detail = {
  task: Task;
  runs: {
    id: string;
    status: string;
    origin: string;
    adapter_error?: string;
    engine_run_id: string | null;
  }[];
  events: EventItem[];
  artifacts: Artifact[];
};
const navigation = [
  { href: "/", key: "overview", label: "Factory floor", Icon: LayoutGrid },
  { href: "/scripts", key: "scripts", label: "Script Writer", Icon: FileText },
  {
    href: "/video-editor",
    key: "video-editor",
    label: "Video Editor",
    Icon: Film,
  },
  { href: "/crm", key: "crm", label: "Lead Tracker", Icon: Users },
  { href: "/finance", key: "finance", label: "Finance", Icon: Wallet },
];
const sectionMeta: Record<
  string,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "YOUR CREATIVE HEADQUARTERS",
    title: "A little office. A lot of possibility.",
    description:
      "Keep an eye on the work, then get back to making good things.",
  },
  scripts: {
    eyebrow: "THE WRITING ROOM",
    title: "Good stories start with a plan.",
    description: "Weekly scripts for Myanmar study-abroad agency owners.",
  },
  "video-editor": {
    eyebrow: "THE EDITING SUITE",
    title: "Give your stories some motion.",
    description:
      "Your existing editing pipeline, with a clearer view of every run.",
  },
  crm: {
    eyebrow: "THE RELATIONSHIP DESK",
    title: "Every conversation counts.",
    description: "A simple place to keep leads moving and follow-ups on time.",
  },
  finance: {
    eyebrow: "THE NUMBERS CORNER",
    title: "A clear view of the business.",
    description: "Record what comes in, what goes out, and where it belongs.",
  },
  tasks: {
    eyebrow: "THE PRODUCTION BOARD",
    title: "One place for the work.",
    description: "Plan a task here. Start the work yourself in Codex.",
  },
  campaigns: {
    eyebrow: "THE BIGGER PICTURE",
    title: "Give your work a direction.",
    description: "Connect scripts, conversations and costs to a shared goal.",
  },
  activity: {
    eyebrow: "THE FACTORY LOG",
    title: "What actually happened.",
    description: "Real events from your instrumented skills and pipeline runs.",
  },
  settings: {
    eyebrow: "BEHIND THE SCENES",
    title: "Keep your factory connected.",
    description: "Your private workspace, tools and delivery connections.",
  },
};
const statusLabel: Record<string, string> = {
  planned: "Planned",
  queued: "Queued",
  running: "Working",
  waiting_review: "Needs review",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  idle: "Idle",
  manual: "Manual",
  stale: "Last seen",
  unknown: "Awaiting report",
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Changes requested",
  pending: "Delivery pending",
  uploading: "Uploading",
  delivered: "Saved to Drive",
  needs_reconnect: "Reconnect Drive",
};
async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("auth/"))
      window.location.assign(new URL("/login", window.location.origin).href);
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}
function relative(value: string | null | undefined) {
  if (!value) return "No reports yet";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  return seconds < 60
    ? "Just now"
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : new Date(value).toLocaleDateString();
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {statusLabel[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
function Empty({
  Icon = FolderOpen,
  title,
  children,
  action,
}: {
  Icon?: typeof FolderOpen;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={25} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Field({
  label,
  name,
  defaultValue = "",
  type = "text",
  required = false,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <label>
      {label}
      {children ? (
        <select aria-label={label} name={name} defaultValue={defaultValue}>
          {children}
        </select>
      ) : type === "textarea" ? (
        <textarea
          aria-label={label}
          name={name}
          defaultValue={defaultValue}
          rows={3}
          required={required}
        />
      ) : (
        <input
          aria-label={label}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          step={type === "number" ? "0.01" : undefined}
          min={type === "number" ? "0.01" : undefined}
        />
      )}
    </label>
  );
}
function values(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<
    string,
    string
  >;
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
      {
        type:
          typeof data === "string"
            ? "text/markdown;charset=utf-8"
            : "application/json",
      },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function FactoryApp({
  section,
  initialTaskId,
}: {
  section: string;
  initialTaskId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [archive, setArchive] = useState<{
    tasks: Task[];
    leads: Lead[];
    transactions: Transaction[];
    events: EventItem[];
  }>({ tasks: [], leads: [], transactions: [], events: [] });
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [foundTasks, setFoundTasks] = useState<Task[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [leadActivities, setLeadActivities] = useState<
    { id: string; kind: string; notes: string; occurred_at: string }[]
  >([]);
  const refresh = useCallback(async () => {
    try {
      setData(await api<Snapshot>("factory/overview"));
      setError("");
      if (section === "finance")
        setTransactions(await api<Transaction[]>("finance/transactions"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [section]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (!active) return;
      await refresh();
      if (active) timer = setTimeout(tick, document.hidden ? 30000 : 5000);
    }
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  const openTask = useCallback(async (id: string) => {
    try {
      setDetail(await api<Detail>("tasks/" + id));
      setModal("detail");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const detailId = detail?.task.id;
  useEffect(() => {
    if (modal !== "detail" || !detailId) return;
    let stopped = false;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void api<Detail>("tasks/" + detailId)
        .then((result) => {
          if (!stopped)
            setDetail((previous) =>
              previous?.task.id === result.task.id
                ? {
                    ...result,
                    events: mergeRecords(result.events, previous.events),
                  }
                : previous,
            );
        })
        .catch((error) => {
          if (!stopped) setError(error.message);
        });
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [modal, detailId]);
  useEffect(() => {
    let stopped = false;
    const timer = setTimeout(() => {
      if (!search.trim()) {
        setFoundTasks(null);
        return;
      }
      const worker =
        section === "scripts"
          ? "script_writer"
          : section === "video-editor"
            ? "video_editor"
            : "";
      const query = new URLSearchParams({
        search,
        ...(worker ? { worker } : {}),
        ...(filter !== "all" ? { status: filter } : {}),
      });
      void api<Task[]>("tasks?" + query)
        .then((rows) => {
          if (!stopped) setFoundTasks(rows);
        })
        .catch((error) => {
          if (!stopped) setError(error.message);
        });
    }, 200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [search, filter, section]);
  useEffect(() => {
    if (!initialTaskId) return;
    let active = true;
    void api<Detail>("tasks/" + initialTaskId)
      .then((result) => {
        if (active) {
          setDetail(result);
          setModal("detail");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [initialTaskId]);
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const result = await api(path, method, body);
      await refresh();
      return result;
    } catch (e) {
      setNotice((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  function close() {
    setModal(null);
    setNotice("");
    setSelectedLead(null);
    setSelectedTransaction(null);
  }
  const meta = sectionMeta[section] ?? sectionMeta.overview;
  const taskRows = mergeRecords(data?.tasks ?? [], archive.tasks);
  const leadRows = mergeRecords(data?.leads ?? [], archive.leads);
  const transactionRows = mergeRecords(transactions, archive.transactions);
  const eventRows = mergeRecords(data?.events ?? [], archive.events);
  const currentTasks = (foundTasks ?? taskRows).filter(
    (t) =>
      (section === "scripts"
        ? t.worker_id === "script_writer"
        : section === "video-editor"
          ? t.worker_id === "video_editor"
          : true) &&
      (filter === "all" || t.status === filter) &&
      t.title.toLowerCase().includes(search.toLowerCase()),
  );
  const historyKey = ["tasks", "scripts", "video-editor"].includes(section)
    ? "tasks"
    : section === "crm"
      ? "leads"
      : section === "finance"
        ? "transactions"
        : section === "activity"
          ? "events"
          : null;
  async function loadOlder() {
    if (!data || !historyKey) return;
    setBusy(true);
    try {
      if (historyKey === "tasks") {
        const rows = await api<Task[]>("tasks?offset=" + taskRows.length);
        setArchive((previous) => ({
          ...previous,
          tasks: mergeRecords(previous.tasks, rows),
        }));
        setMore((previous) => ({ ...previous, tasks: rows.length === 200 }));
      }
      if (historyKey === "leads") {
        const rows = await api<Lead[]>("leads?offset=" + leadRows.length);
        setArchive((previous) => ({
          ...previous,
          leads: mergeRecords(previous.leads, rows),
        }));
        setMore((previous) => ({ ...previous, leads: rows.length === 200 }));
      }
      if (historyKey === "transactions") {
        const rows = await api<Transaction[]>(
          "finance/transactions?offset=" + transactionRows.length,
        );
        setArchive((previous) => ({
          ...previous,
          transactions: mergeRecords(previous.transactions, rows),
        }));
        setMore((previous) => ({
          ...previous,
          transactions: rows.length === 200,
        }));
      }
      if (historyKey === "events") {
        const rows = await api<EventItem[]>(
          "activity?offset=" + eventRows.length,
        );
        setArchive((previous) => ({
          ...previous,
          events: mergeRecords(previous.events, rows),
        }));
        setMore((previous) => ({ ...previous, events: rows.length === 200 }));
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const addLabel =
    section === "crm"
      ? "Add lead"
      : section === "finance"
        ? "Add transaction"
        : section === "campaigns"
          ? "New campaign"
          : "Plan a task";
  const openAdd = () => {
    setModal(
      section === "crm"
        ? "lead"
        : section === "finance"
          ? "transaction"
          : section === "campaigns"
            ? "campaign"
            : "task",
    );
    setNotice("");
  };
  const showWorker = (worker: OfficeWorker) => {
    if (worker.id === "crm") {
      router.push("/crm");
      return;
    }
    if (worker.id === "finance") {
      router.push("/finance");
      return;
    }
    if (worker.task) void openTask(worker.task.id);
    else {
      setModal("worker:" + worker.id);
      setNotice("");
    }
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-icon">
            m<span>f</span>
          </span>
          <span>
            marketing
            <br />
            <strong>factory</strong>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">L</span>
          <div>
            Your workspace<small>Personal factory</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navigation.map(({ href, key, label, Icon }) => (
            <Link
              key={key}
              href={href}
              onClick={() => setMenu(false)}
              className={section === key ? "nav-active" : ""}
            >
              <Icon size={18} />
              {label}
              {key === "scripts" && !!data?.counts.review && (
                <span className="nav-count">{data.counts.review}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="nav-caption nav-second">ORGANIZE</div>
        <nav>
          <Link
            href="/tasks"
            className={section === "tasks" ? "nav-active" : ""}
          >
            <ClipboardList size={18} />
            All tasks
          </Link>
          <Link
            href="/campaigns"
            className={section === "campaigns" ? "nav-active" : ""}
          >
            <FolderOpen size={18} />
            Campaigns
          </Link>
          <Link
            href="/activity"
            className={section === "activity" ? "nav-active" : ""}
          >
            <Radio size={18} />
            Activity log
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="manual-note">
            <span className="small mono">YOU’RE IN CHARGE</span>
            <p>
              A factory that works
              <br />
              at your pace.
            </p>
            <span>Tasks start with you in Codex.</span>
          </div>
          <nav>
            <Link
              href="/settings"
              className={section === "settings" ? "nav-active" : ""}
            >
              <Settings size={18} />
              Settings
            </Link>
          </nav>
          <div className="owner-row">
            <span className="owner-avatar">L</span>
            <div>
              Factory owner<small>Private workspace</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api("auth/logout", "POST", {});
                window.location.assign(
                  new URL("/login", window.location.origin).href,
                );
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <span>
              {section === "overview"
                ? "Factory floor"
                : (navigation.find((n) => n.key === section)?.label ??
                  sectionMeta[section]?.eyebrow.toLowerCase())}
            </span>
          </div>
          <div className="topbar-right">
            <span className={`connection ${error ? "connection-error" : ""}`}>
              <i />
              {error
                ? "Connection interrupted"
                : data
                  ? "Connected"
                  : "Connecting"}
            </span>
            <span className="topbar-divider" />
            <span className="owner-avatar small-avatar">L</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{meta.eyebrow}</span>
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
            </div>
            {!["activity", "settings"].includes(section) && (
              <button className="btn primary" onClick={openAdd}>
                <Plus size={17} />
                {addLabel}
              </button>
            )}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error} <button onClick={() => void refresh()}>Retry</button>
              {data && (
                <span>Last snapshot: {relative(data.generated_at)}</span>
              )}
            </div>
          )}
          {!data ? (
            <div className="loading-state">
              <LoaderCircle className="spin" size={24} />
              <p>Opening your factory…</p>
            </div>
          ) : (
            <>
              {section === "overview" && (
                <>
                  <div className="stats-row">
                    <Stat
                      label="IN PRODUCTION"
                      value={data.counts.active}
                      caption="workers reporting work"
                      Icon={Sparkles}
                    />
                    <Stat
                      label="NEEDS YOUR EYES"
                      value={data.counts.review}
                      caption="tasks awaiting review"
                      Icon={FileText}
                    />
                    <Stat
                      label="FINISHED WORK"
                      value={data.counts.completed}
                      caption="completed tasks"
                      Icon={Check}
                    />
                    <Stat
                      label="CONVERSATIONS"
                      value={data.counts.leads}
                      caption="leads in your tracker"
                      Icon={Users}
                    />
                  </div>
                  <section className="office-panel panel">
                    <div className="panel-heading">
                      <div>
                        <span className="small eyebrow">THE FACTORY FLOOR</span>
                        <h2>Everyone has a place.</h2>
                      </div>
                      <div className="office-legend">
                        <span>
                          <i className="legend-active" />
                          Working
                        </span>
                        <span>
                          <i className="legend-review" />
                          Needs review
                        </span>
                        <span>
                          <i />
                          Idle / manual
                        </span>
                      </div>
                    </div>
                    <PixelOffice workers={data.workers} onWorker={showWorker} />
                    <div className="office-footer">
                      <span>
                        <span className="live-dot" />
                        Actual task reports · updated{" "}
                        {relative(data.generated_at)}
                      </span>
                      <span>
                        Click a desk to take a closer look{" "}
                        <ArrowUpRight size={13} />
                      </span>
                    </div>
                  </section>
                  <div className="below-office">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Your people, at a glance</h2>
                        <span className="small muted">4 WORKSPACES</span>
                      </div>
                      <div className="worker-list">
                        {data.workers.map((w) => (
                          <button
                            key={w.id}
                            className="worker-row"
                            onClick={() => showWorker(w)}
                          >
                            <span
                              className="worker-avatar"
                              style={{
                                background: w.color + "25",
                                color: w.color,
                              }}
                            >
                              {w.initials}
                            </span>
                            <div>
                              <strong>{w.name}</strong>
                              <small>{w.task?.title ?? w.role}</small>
                            </div>
                            <Badge status={w.status} />
                            <ArrowUpRight size={15} className="muted" />
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Fresh off the desk</h2>
                        <Link className="text-link" href="/tasks">
                          All work <ArrowUpRight size={13} />
                        </Link>
                      </div>
                      {data.artifacts.length ? (
                        <div className="artifact-list">
                          {data.artifacts.slice(0, 4).map((a) => (
                            <button
                              key={a.id}
                              className="artifact-row"
                              onClick={() => void openTask(a.task_id)}
                            >
                              <span className="file-icon">
                                {a.type === "video" ? (
                                  <Film size={19} />
                                ) : (
                                  <FileText size={19} />
                                )}
                              </span>
                              <div>
                                <strong>{a.title}</strong>
                                <small>{relative(a.created_at)}</small>
                              </div>
                              <Badge status={a.review_status} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Empty Icon={FileText} title="A clean desk, for now.">
                          Your script packages and finished videos will find a
                          home here.
                        </Empty>
                      )}
                    </section>
                  </div>
                </>
              )}
              {["tasks", "scripts", "video-editor"].includes(section) && (
                <>
                  {section !== "tasks" && (
                    <div className="pipeline-banner">
                      <div className="icon-tile">
                        {section === "scripts" ? (
                          <FileText size={23} />
                        ) : (
                          <Film size={23} />
                        )}
                      </div>
                      <div>
                        <h3>
                          {section === "scripts"
                            ? "A week of useful stories."
                            : "The editor you already know."}
                        </h3>
                        <p>
                          {section === "scripts"
                            ? "4 education + 3 demos · Burmese narration · Your approval before recording"
                            : "Manual Codex direction → Railway processing → QA → private Google Drive delivery"}
                        </p>
                      </div>
                      <span className="badge badge-manual">Manual start</span>
                    </div>
                  )}
                  <section className="panel">
                    <div className="table-toolbar">
                      <div className="tabs">
                        {[
                          ["all", "All tasks"],
                          ["planned", "Planned"],
                          ["running", "Working"],
                          ["waiting_review", "Review"],
                          ["completed", "Completed"],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            className={filter === key ? "tab-active" : ""}
                            onClick={() => setFilter(key)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className="search">
                        <Search size={15} />
                        <input
                          aria-label="Search tasks"
                          placeholder="Find a task…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                    </div>
                    {currentTasks.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>TASK</th>
                              <th>WORKSPACE</th>
                              <th>STATUS</th>
                              <th>UPDATED</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {currentTasks.map((task) => (
                              <tr key={task.id}>
                                <td>
                                  <button
                                    className="table-title"
                                    onClick={() => void openTask(task.id)}
                                  >
                                    {task.title}
                                  </button>
                                  <small className="table-subtitle">
                                    {task.source === "manual"
                                      ? "Manual record"
                                      : "Reported by workflow"}
                                  </small>
                                </td>
                                <td>
                                  {
                                    data.workers.find(
                                      (w) => w.id === task.worker_id,
                                    )?.name
                                  }
                                </td>
                                <td>
                                  <Badge status={task.status} />
                                </td>
                                <td className="muted">
                                  {relative(task.updated_at)}
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={"Open " + task.title}
                                    onClick={() => void openTask(task.id)}
                                  >
                                    <ArrowUpRight size={18} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        Icon={section === "video-editor" ? Film : FileText}
                        title={
                          search || filter !== "all"
                            ? "No matching tasks."
                            : "Your next good idea starts here."
                        }
                      >
                        {search || filter !== "all"
                          ? "Try a different search or status."
                          : "Plan the work, then ask Codex to start it when you are ready."}
                        <br />
                        {!search && filter === "all" && (
                          <button
                            className="btn secondary"
                            onClick={() => setModal("task")}
                          >
                            <Plus size={16} />
                            Plan your first task
                          </button>
                        )}
                      </Empty>
                    )}
                  </section>
                  {section === "video-editor" && data.delivery.length > 0 && (
                    <section className="panel section-gap">
                      <div className="panel-heading">
                        <h2>Delivery desk</h2>
                        <span className="small muted">GOOGLE DRIVE</span>
                      </div>
                      {data.delivery.map((d) => (
                        <div className="delivery-row" key={d.id}>
                          <div>
                            <strong>{d.title}</strong>
                            <small>
                              {d.error ??
                                "Delivery is tracked separately from rendering."}
                            </small>
                          </div>
                          <Badge status={d.status} />
                          {["failed", "pending", "needs_reconnect"].includes(
                            d.status,
                          ) && (
                            <button
                              className="btn secondary small-btn"
                              disabled={busy}
                              onClick={() =>
                                void mutate(
                                  "delivery/" + d.id + "/retry",
                                  "POST",
                                  {},
                                ).catch(() => {})
                              }
                            >
                              Retry delivery
                            </button>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}
              {section === "crm" && (
                <>
                  <div className="mini-stats">
                    {["new", "qualified", "proposal", "won"].map((stage) => (
                      <div key={stage}>
                        <span>
                          {stage === "new"
                            ? "New conversations"
                            : stage === "won"
                              ? "Deals won"
                              : stage === "proposal"
                                ? "Proposals sent"
                                : "Qualified leads"}
                        </span>
                        <strong>{data.lead_stage_counts[stage] ?? 0}</strong>
                      </div>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Your lead book</h2>
                      <span className="small muted">MANUALLY MAINTAINED</span>
                    </div>
                    {leadRows.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>NAME / COMPANY</th>
                              <th>STAGE</th>
                              <th>SOURCE</th>
                              <th>NEXT FOLLOW-UP</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {leadRows.map((lead) => (
                              <tr key={lead.id}>
                                <td>
                                  <button
                                    className="table-title"
                                    onClick={() => {
                                      setSelectedLead(lead);
                                      setModal("lead");
                                      void api<typeof leadActivities>(
                                        "leads/" + lead.id + "/activities",
                                      ).then(setLeadActivities);
                                    }}
                                  >
                                    {lead.name}
                                  </button>
                                  <small className="table-subtitle">
                                    {lead.company || lead.contact}
                                  </small>
                                </td>
                                <td>
                                  <Badge status={lead.stage} />
                                </td>
                                <td>{lead.source}</td>
                                <td
                                  className={
                                    lead.next_follow_up &&
                                    new Date(lead.next_follow_up) < new Date()
                                      ? "due-date"
                                      : "muted"
                                  }
                                >
                                  {lead.next_follow_up
                                    ? new Date(
                                        lead.next_follow_up,
                                      ).toLocaleDateString()
                                    : "Not scheduled"}
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={"Edit " + lead.name}
                                    onClick={() => {
                                      setSelectedLead(lead);
                                      setModal("lead");
                                    }}
                                  >
                                    <MoreHorizontal size={18} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        Icon={Users}
                        title="Good relationships start small."
                      >
                        Add your first lead and give the next conversation a
                        place to live.
                        <br />
                        <button
                          className="btn secondary"
                          onClick={() => setModal("lead")}
                        >
                          <Plus size={16} />
                          Add your first lead
                        </button>
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {section === "finance" && (
                <>
                  {data.finance.length > 0 ? (
                    <div className="currency-summaries">
                      {data.finance.map((f) => (
                        <section
                          className="panel currency-card"
                          key={f.currency}
                        >
                          <span className="eyebrow">
                            {f.currency} · ALL RECORDED TRANSACTIONS
                          </span>
                          <div>
                            <span>Recorded balance</span>
                            <h2>
                              {f.balance} <small>{f.currency}</small>
                            </h2>
                          </div>
                          <footer>
                            <span>
                              <ArrowDownLeft size={15} />
                              Income {f.income}
                            </span>
                            <span>
                              <ArrowUpRight size={15} />
                              Expenses {f.expense}
                            </span>
                          </footer>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="pipeline-banner">
                      <Wallet size={24} />
                      <div>
                        <h3>Every number has a story.</h3>
                        <p>
                          Add your first transaction to start your per-currency
                          summary.
                        </p>
                      </div>
                    </div>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Income & expenses</h2>
                      <span className="small muted">OWNER-ENTERED RECORDS</span>
                    </div>
                    {transactionRows.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>CATEGORY / NOTE</th>
                              <th>TYPE</th>
                              <th>AMOUNT</th>
                              <th>DATE</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {transactionRows.map((t) => (
                              <tr key={t.id}>
                                <td>
                                  <strong>{t.category}</strong>
                                  <small className="table-subtitle">
                                    {t.note || "—"}
                                  </small>
                                </td>
                                <td>
                                  <Badge status={t.type} />
                                </td>
                                <td
                                  className={
                                    t.type === "income"
                                      ? "amount-income"
                                      : "amount-expense"
                                  }
                                >
                                  {t.type === "income" ? "+" : "−"}
                                  {t.amount}{" "}
                                  <span className="small">{t.currency}</span>
                                </td>
                                <td>
                                  {new Date(
                                    t.transaction_date,
                                  ).toLocaleDateString()}
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={"Edit " + t.category}
                                    onClick={() => {
                                      setSelectedTransaction(t);
                                      setModal("transaction");
                                    }}
                                  >
                                    <MoreHorizontal size={18} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty Icon={Wallet} title="Room for your first entry.">
                        Track income and expenses without mixing currencies or
                        guessing attribution.
                      </Empty>
                    )}
                  </section>
                  <p className="footnote">
                    Recorded income minus expenses is an operational summary.
                    Campaign links are owner-entered associations.
                  </p>
                </>
              )}
              {section === "campaigns" && (
                <div className="campaign-grid">
                  {data.campaigns.length ? (
                    data.campaigns.map((c) => (
                      <section className="panel campaign-card" key={c.id}>
                        <div className="icon-tile">
                          <FolderOpen size={21} />
                        </div>
                        <h2>{c.name}</h2>
                        <p>{c.audience}</p>
                        <span className="small muted">
                          {c.goal || "No goal recorded yet."}
                        </span>
                        <footer>
                          <span>{c.tasks} linked tasks</span>
                          <button
                            className="text-link"
                            onClick={() => setModal("task")}
                          >
                            Plan work <ArrowRight size={14} />
                          </button>
                        </footer>
                      </section>
                    ))
                  ) : (
                    <section className="panel full-width">
                      <Empty
                        Icon={FolderOpen}
                        title="Start with a shared goal."
                      >
                        Create a campaign, then connect your scripts, leads and
                        expenses.
                        <br />
                        <button
                          className="btn secondary"
                          onClick={() => setModal("campaign")}
                        >
                          <Plus size={16} />
                          Create a campaign
                        </button>
                      </Empty>
                    </section>
                  )}
                </div>
              )}
              {section === "activity" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Reported activity</h2>
                    <span className="small muted">LATEST 30 EVENTS</span>
                  </div>
                  {eventRows.length ? (
                    <EventTimeline events={eventRows} />
                  ) : (
                    <Empty Icon={Radio} title="Quiet on the factory floor.">
                      Reported stages appear here when you run an instrumented
                      factory skill.
                    </Empty>
                  )}
                </section>
              )}
              {section === "settings" && (
                <div className="settings-grid">
                  <section className="panel settings-card">
                    <div className="settings-icon">
                      <ShieldCheck size={22} />
                    </div>
                    <h2>A space that stays yours.</h2>
                    <p>
                      Single-owner password access. Business records stay behind
                      your owner session.
                    </p>
                    <div className="setting-line">
                      <span>Database</span>
                      <Badge
                        status={
                          data.database === "neon" ? "connected" : "local"
                        }
                      />
                    </div>
                    <div className="setting-line">
                      <span>Business data schema</span>
                      <code>marketing_factory</code>
                    </div>
                    <a href="/api/export" download className="btn secondary">
                      <Download size={16} />
                      Export business records
                    </a>
                  </section>
                  <section className="panel settings-card">
                    <div className="settings-icon">
                      <FolderOpen size={22} />
                    </div>
                    <h2>Google Drive delivery</h2>
                    <p>
                      Finished videos are saved privately after the required
                      quality checks. Connect your account separately from owner
                      login.
                    </p>
                    <div className="setting-line">
                      <span>Google account</span>
                      <Badge
                        status={
                          data.integrations.drive_connected
                            ? "connected"
                            : "not_connected"
                        }
                      />
                    </div>
                    <button
                      className="btn secondary"
                      disabled={busy || !data.integrations.google_configured}
                      onClick={async () => {
                        try {
                          const result = (await mutate(
                            "integrations/google/connect",
                            "POST",
                            {},
                          )) as { url: string };
                          window.location.href = result.url;
                        } catch {}
                      }}
                    >
                      {data.integrations.drive_connected
                        ? "Reconnect Google Drive"
                        : "Connect Google Drive"}
                      <ArrowUpRight size={15} />
                    </button>
                    {!data.integrations.google_configured && (
                      <p className="small muted">
                        Google OAuth credentials need to be configured on the
                        server.
                      </p>
                    )}
                  </section>
                  <section className="panel settings-card">
                    <div className="settings-icon">
                      <Radio size={22} />
                    </div>
                    <h2>Codex reporting bridge</h2>
                    <p>
                      Factory skills report known stages through a local CLI.
                      This connection never launches tasks or reads unrelated
                      Codex conversations.
                    </p>
                    <div className="setting-line">
                      <span>Bridge secret</span>
                      <Badge
                        status={
                          data.integrations.bridge_configured
                            ? "configured"
                            : "not_configured"
                        }
                      />
                    </div>
                    <code className="code-block">npm run factory -- help</code>
                    <p className="small muted">
                      Configure FACTORY_URL and FACTORY_BRIDGE_TOKEN in the CLI
                      environment.
                    </p>
                  </section>
                  <section className="panel settings-card">
                    <div className="settings-icon">
                      <RefreshCw size={22} />
                    </div>
                    <h2>Remote video & delivery</h2>
                    <p>
                      The existing editor handles media processing. A separate
                      worker observes registered runs and transfers outputs.
                    </p>
                    <div className="setting-line">
                      <span>Artifact storage</span>
                      <Badge
                        status={
                          data.integrations.storage_configured
                            ? "configured"
                            : "not_configured"
                        }
                      />
                    </div>
                    <div className="setting-line">
                      <span>Delivery worker</span>
                      <span className="small muted">
                        {relative(data.integrations.worker_last_seen)}
                      </span>
                    </div>
                    <span className="small muted">
                      Character art can be replaced independently of this
                      system.
                    </span>
                  </section>
                </div>
              )}
            </>
          )}
          {data &&
            historyKey &&
            more[historyKey] !== false &&
            !search &&
            ((historyKey === "tasks" && data.tasks.length === 200) ||
              (historyKey === "leads" && data.leads.length === 200) ||
              (historyKey === "transactions" && transactions.length === 200) ||
              (historyKey === "events" && data.events.length === 30)) && (
              <div className="history-control">
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void loadOlder()}
                >
                  {busy ? "Loading…" : "Load older records"}
                </button>
              </div>
            )}
          <footer className="page-footer">
            <span>
              <span className="tiny-square" /> Built around your rhythm.
            </span>
            <span>
              MARKETING FACTORY <span className="muted">/</span> V1
            </span>
          </footer>
        </main>
      </div>
      {modal && modal !== "detail" && (
        <Modal
          title={
            modal === "task"
              ? "Plan a new task"
              : modal === "lead"
                ? selectedLead
                  ? "Lead details"
                  : "A new conversation"
                : modal === "transaction"
                  ? selectedTransaction
                    ? "Edit transaction"
                    : "Record a transaction"
                  : modal === "campaign"
                    ? "Create a campaign"
                    : modal === "import"
                      ? "Import a script package"
                      : "Your workspace"
          }
          onClose={close}
        >
          {notice && (
            <p className="form-alert" role="alert">
              {notice}
            </p>
          )}
          {modal === "task" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const v = values(e.currentTarget);
                try {
                  await mutate("tasks", "POST", {
                    ...v,
                    campaign_id: v.campaign_id || null,
                  });
                  close();
                } catch {}
              }}
            >
              <p className="form-hint">
                This plans the work. You decide when to start it in Codex.
              </p>
              <Field label="Task title" name="title" required />
              <Field
                label="Workspace"
                name="worker_id"
                defaultValue={
                  section === "scripts"
                    ? "script_writer"
                    : section === "video-editor"
                      ? "video_editor"
                      : "script_writer"
                }
              >
                {data?.workers.map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.name}
                  </option>
                ))}
              </Field>
              <Field label="Campaign (optional)" name="campaign_id">
                <option value="">No campaign</option>
                {data?.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Field>
              <Field label="Brief / notes" name="description" type="textarea" />
              <FormFooter
                busy={busy}
                label="Create planned task"
                close={close}
              />
            </form>
          )}
          {modal === "lead" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const v = values(e.currentTarget);
                try {
                  await mutate(
                    selectedLead ? "leads/" + selectedLead.id : "leads",
                    selectedLead ? "PATCH" : "POST",
                    {
                      ...v,
                      next_follow_up: v.next_follow_up || null,
                      campaign_id: v.campaign_id || null,
                    },
                  );
                  close();
                } catch {}
              }}
            >
              <div className="form-grid">
                <Field
                  label="Name"
                  name="name"
                  defaultValue={selectedLead?.name}
                  required
                />
                <Field
                  label="Company / agency"
                  name="company"
                  defaultValue={selectedLead?.company}
                />
              </div>
              <Field
                label="Contact details"
                name="contact"
                defaultValue={selectedLead?.contact}
              />
              <div className="form-grid">
                <Field
                  label="Stage"
                  name="stage"
                  defaultValue={selectedLead?.stage ?? "new"}
                >
                  {[
                    "new",
                    "contacted",
                    "qualified",
                    "proposal",
                    "won",
                    "lost",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </Field>
                <Field
                  label="Source"
                  name="source"
                  defaultValue={selectedLead?.source ?? "Manual"}
                />
              </div>
              <div className="form-grid">
                <Field
                  label="Next follow-up"
                  name="next_follow_up"
                  type="date"
                  defaultValue={selectedLead?.next_follow_up?.slice(0, 10)}
                />
                <Field
                  label="Campaign"
                  name="campaign_id"
                  defaultValue={selectedLead?.campaign_id ?? ""}
                >
                  <option value="">No campaign</option>
                  {data?.campaigns.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Field>
              </div>
              <Field
                label="Notes"
                name="notes"
                type="textarea"
                defaultValue={selectedLead?.notes}
              />
              {selectedLead && leadActivities.length > 0 && (
                <details>
                  <summary>Activity history</summary>
                  {leadActivities.map((a) => (
                    <p className="small" key={a.id}>
                      {new Date(a.occurred_at).toLocaleString()} · {a.notes}
                    </p>
                  ))}
                </details>
              )}
              <FormFooter
                busy={busy}
                label={selectedLead ? "Save lead" : "Add lead"}
                close={close}
              />
            </form>
          )}
          {modal === "transaction" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const v = values(e.currentTarget);
                try {
                  await mutate(
                    selectedTransaction
                      ? "finance/transactions/" + selectedTransaction.id
                      : "finance/transactions",
                    selectedTransaction ? "PATCH" : "POST",
                    {
                      ...v,
                      campaign_id: v.campaign_id || null,
                      lead_id: v.lead_id || null,
                    },
                  );
                  close();
                } catch {}
              }}
            >
              <div className="form-grid">
                <Field
                  label="Type"
                  name="type"
                  defaultValue={selectedTransaction?.type ?? "expense"}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </Field>
                <Field
                  label="Date"
                  name="transaction_date"
                  type="date"
                  defaultValue={
                    selectedTransaction?.transaction_date?.slice(0, 10) ??
                    new Date().toLocaleDateString("en-CA")
                  }
                  required
                />
              </div>
              <div className="form-grid">
                <Field
                  label="Amount"
                  name="amount"
                  type="number"
                  defaultValue={selectedTransaction?.amount}
                  required
                />
                <Field
                  label="Currency"
                  name="currency"
                  defaultValue={selectedTransaction?.currency ?? "THB"}
                >
                  <option>THB</option>
                  <option>MMK</option>
                  <option>USD</option>
                </Field>
              </div>
              <Field
                label="Category"
                name="category"
                defaultValue={selectedTransaction?.category}
                required
              />
              <div className="form-grid">
                <Field
                  label="Campaign"
                  name="campaign_id"
                  defaultValue={selectedTransaction?.campaign_id ?? ""}
                >
                  <option value="">No campaign</option>
                  {data?.campaigns.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Field>
                <Field
                  label="Lead"
                  name="lead_id"
                  defaultValue={selectedTransaction?.lead_id ?? ""}
                >
                  <option value="">No lead</option>
                  {data?.leads.map((l) => (
                    <option value={l.id} key={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Field>
              </div>
              <Field
                label="Note"
                name="note"
                type="textarea"
                defaultValue={selectedTransaction?.note}
              />
              <FormFooter busy={busy} label="Save transaction" close={close} />
            </form>
          )}
          {modal === "campaign" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await mutate("campaigns", "POST", values(e.currentTarget));
                  close();
                } catch {}
              }}
            >
              <Field label="Campaign name" name="name" required />
              <Field
                label="Audience"
                name="audience"
                defaultValue="Myanmar study-abroad agency owners"
                required
              />
              <Field label="Goal" name="goal" type="textarea" />
              <FormFooter busy={busy} label="Create campaign" close={close} />
            </form>
          )}
          {modal.startsWith("worker:") && (
            <div className="worker-intro">
              <div className="icon-tile">
                {modal.endsWith("script_writer") ? (
                  <FileText size={24} />
                ) : (
                  <Film size={24} />
                )}
              </div>
              <h3>
                {modal.endsWith("script_writer")
                  ? "Your next script is waiting to happen."
                  : "Ready for your next edit."}
              </h3>
              <p>
                There are no active tasks at this desk. Plan a task, then ask
                Codex to run the factory workflow.
              </p>
              <button className="btn primary" onClick={() => setModal("task")}>
                <Plus size={16} />
                Plan a task
              </button>
            </div>
          )}
        </Modal>
      )}
      {modal === "detail" && detail && (
        <Modal title={detail.task.title} wide onClose={close}>
          <div className="task-meta">
            <Badge status={detail.task.status} />
            <span className="small muted">
              {detail.task.source === "manual"
                ? "Manual record"
                : "Instrumented workflow"}
            </span>
            <code>{detail.task.id.slice(0, 8)}</code>
          </div>
          {notice && (
            <p className="form-alert" role="alert">
              {notice}
            </p>
          )}
          <p className="task-description">
            {detail.task.description ||
              "No extra notes. A clean brief is a good start."}
          </p>
          <div className="detail-actions">
            <button
              className="btn secondary small-btn"
              onClick={async () => {
                await navigator.clipboard.writeText(detail.task.id);
                setNotice("Task ID copied.");
              }}
            >
              <Copy size={14} />
              Copy task ID
            </button>
            <label className="btn secondary small-btn file-input">
              <Plus size={14} />
              Import script package
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const input = JSON.parse(await file.text());
                    await mutate("packages", "POST", {
                      task_id: detail.task.id,
                      package: input,
                    });
                    await openTask(detail.task.id);
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              />
            </label>
            <select
              aria-label="Manual task status"
              value={detail.task.status}
              disabled={busy}
              onChange={async (e) => {
                try {
                  await mutate("tasks/" + detail.task.id, "PATCH", {
                    status: e.target.value,
                  });
                  await openTask(detail.task.id);
                } catch {}
              }}
            >
              {[
                "planned",
                "queued",
                "running",
                "waiting_review",
                "completed",
                "failed",
                "cancelled",
              ].map((s) => (
                <option value={s} key={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </div>
          <details className="bridge-instructions">
            <summary>Run this task from your current Codex app</summary>
            <p>
              Ask Codex to use the factory script-writer skill or editor adapter
              with this task ID. The reporter does not start another agent.
            </p>
            <code className="code-block">
              npm run factory -- start --task {detail.task.id}
            </code>
            <span className="small muted">
              Reporter events describe known stages. A live bridge is not proof
              that Codex is still executing.
            </span>
          </details>
          {detail.task.worker_id === "script_writer" && (
            <div className="pipeline-steps">
              {[
                ["audience", "Audience research"],
                ["strategy", "Weekly strategy"],
                ["hooks", "Hook options"],
                ["drafting", "Script drafting"],
                ["quality_review", "Quality review"],
                ["export", "Package export"],
              ].map(([id, title]) => {
                const event = detail.events.find((e) => e.step_id === id);
                return (
                  <div className="pipeline-step" key={id}>
                    {title}
                    <small>
                      {!event
                        ? "Not reported"
                        : event.event_type === "step.completed"
                          ? "Reported complete"
                          : event.event_type === "step.failed"
                            ? "Failed"
                            : "Last reported started"}
                    </small>
                  </div>
                );
              })}
            </div>
          )}
          {detail.artifacts.map((a) => (
            <section className="review-artifact" key={a.id}>
              <div className="panel-heading">
                <div>
                  <h3>{a.title}</h3>
                  <span className="small muted">
                    Revision {a.sha256.slice(0, 10)} · {relative(a.created_at)}
                  </span>
                </div>
                <Badge status={a.review_status} />
              </div>
              {a.content_json && (
                <>
                  <p>{a.content_json.overview}</p>
                  {a.content_json.scripts.map((s) => (
                    <details className="script-item" key={s.script_id}>
                      <summary>
                        <span className="script-day">
                          DAY {String(s.day).padStart(2, "0")}
                        </span>
                        <strong>{s.title}</strong>
                        <span className="small muted">
                          {s.category === "educational" ? "Education" : "Demo"}{" "}
                          · ~{s.estimated_duration_seconds}s
                        </span>
                      </summary>
                      <div className="script-body">
                        <span className="eyebrow">THE HOOK</span>
                        <p className="script-hook">{s.selected_hook}</p>
                        <span className="eyebrow">VOICEOVER & VISUALS</span>
                        {s.body_sections.map((b, i) => (
                          <div key={i}>
                            <p>{b.voiceover}</p>
                            <small className="muted">
                              Visual: {b.visual_direction || "Not specified"}
                            </small>
                          </div>
                        ))}
                        <p>
                          <strong>CTA:</strong> {s.cta}
                        </p>
                        {s.claim_sources.map((c, i) => (
                          <p className="small" key={i}>
                            <a
                              target="_blank"
                              rel="noopener noreferrer"
                              href={c.url}
                            >
                              {c.claim} <ArrowUpRight size={11} />
                            </a>{" "}
                            · checked {c.checked_at}
                          </p>
                        ))}
                      </div>
                    </details>
                  ))}
                </>
              )}
              {a.delivery_status && (
                <p>
                  <Badge status={a.delivery_status} />
                  {a.delivery_job_id &&
                    ["failed", "pending", "needs_reconnect"].includes(
                      a.delivery_status,
                    ) && (
                      <button
                        className="btn secondary small-btn"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await mutate(
                              "delivery/" + a.delivery_job_id + "/retry",
                              "POST",
                              {},
                            );
                            await openTask(detail.task.id);
                          } catch {}
                        }}
                      >
                        Retry delivery
                      </button>
                    )}
                  {a.delivery_error && (
                    <span className="small error-text">
                      {" "}
                      {a.delivery_error}
                    </span>
                  )}
                </p>
              )}
              {a.review_note && (
                <p className="review-note">Feedback: {a.review_note}</p>
              )}
              <div className="detail-actions">
                {a.content_json && (
                  <>
                    <button
                      className="btn secondary small-btn"
                      onClick={() =>
                        download("script-package.json", a.content_json)
                      }
                    >
                      <Download size={14} />
                      JSON
                    </button>
                    <button
                      className="btn secondary small-btn"
                      onClick={() =>
                        download(
                          "weekly-scripts.md",
                          packageMarkdown(a.content_json!),
                        )
                      }
                    >
                      <Download size={14} />
                      Markdown
                    </button>
                  </>
                )}
                {a.drive_url && (
                  <a
                    className="btn secondary small-btn"
                    href={a.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Drive <ArrowUpRight size={14} />
                  </a>
                )}
                {["script_package", "video"].includes(a.type) &&
                  a.run_id === detail.task.current_run_id &&
                  detail.artifacts.find((other) => other.type === a.type)
                    ?.id === a.id &&
                  a.review_status !== "approved" && (
                    <button
                      className="btn primary small-btn"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await mutate(
                            "artifacts/" + a.id + "/review",
                            "POST",
                            { sha256: a.sha256, decision: "approved" },
                          );
                          await openTask(detail.task.id);
                        } catch {}
                      }}
                    >
                      <Check size={14} />
                      Approve this revision
                    </button>
                  )}
                {["script_package", "video"].includes(a.type) &&
                  a.run_id === detail.task.current_run_id &&
                  detail.artifacts.find((other) => other.type === a.type)
                    ?.id === a.id && (
                    <button
                      className="btn secondary small-btn"
                      disabled={busy}
                      onClick={async () => {
                        const note = window.prompt(
                          "What should change in this revision?",
                        );
                        if (note === null) return;
                        try {
                          await mutate(
                            "artifacts/" + a.id + "/review",
                            "POST",
                            {
                              sha256: a.sha256,
                              decision: "rejected",
                              note,
                            },
                          );
                          await openTask(detail.task.id);
                        } catch {}
                      }}
                    >
                      Request changes
                    </button>
                  )}
              </div>
            </section>
          ))}
          <h3 className="detail-section-title">Activity & run history</h3>
          {detail.events.length ? (
            <EventTimeline events={detail.events} />
          ) : (
            <p className="small muted">
              No instrumented events yet. Manual task status is shown above.
            </p>
          )}
          {detail.events.length >= 100 &&
            more["detail:" + detail.task.id] !== false && (
              <button
                className="btn secondary small-btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const rows = await api<EventItem[]>(
                      "tasks/" +
                        detail.task.id +
                        "/events?offset=" +
                        detail.events.length +
                        "&limit=100",
                    );
                    setDetail((previous) =>
                      previous
                        ? {
                            ...previous,
                            events: mergeRecords(previous.events, rows),
                          }
                        : null,
                    );
                    setMore((previous) => ({
                      ...previous,
                      ["detail:" + detail.task.id]: rows.length === 100,
                    }));
                  } catch (error) {
                    setNotice((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Load older task events
              </button>
            )}
          {detail.runs.map((r) => (
            <div className="run-row" key={r.id}>
              <div>
                <code>{r.id.slice(0, 8)}</code>
                <small>
                  {r.origin}
                  {r.engine_run_id ? " · " + r.engine_run_id : ""}
                </small>
                {r.adapter_error && (
                  <p className="small error-text">{r.adapter_error}</p>
                )}
              </div>
              <Badge status={r.status} />
              {!r.engine_run_id &&
                ["started", "running"].includes(r.status) && (
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={async () => {
                      const note = window.prompt(
                        "Confirm this Codex run has stopped. Record the reason:",
                      );
                      if (!note) return;
                      try {
                        await mutate("runs/" + r.id + "/interrupt", "POST", {
                          note,
                        });
                        await openTask(detail.task.id);
                      } catch {}
                    }}
                  >
                    Mark interrupted
                  </button>
                )}
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  caption,
  Icon,
}: {
  label: string;
  value: number;
  caption: string;
  Icon: typeof Home;
}) {
  return (
    <div className="stat">
      <div>
        <span className="stat-label">{label}</span>
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <span className="small muted">{caption}</span>
    </div>
  );
}
function FormFooter({
  busy,
  label,
  close,
}: {
  busy: boolean;
  label: string;
  close: () => void;
}) {
  return (
    <div className="form-footer">
      <button type="button" className="btn secondary" onClick={close}>
        Cancel
      </button>
      <button className="btn primary" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Plus size={16} />
        )}{" "}
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
function EventTimeline({ events }: { events: EventItem[] }) {
  return (
    <ol className="event-timeline">
      {events.map((e) => (
        <li key={e.event_id}>
          <span className="event-dot" />
          <div>
            <strong>{e.message || e.event_type.replaceAll(".", " · ")}</strong>
            <small>{e.title ?? e.step_id ?? e.event_type}</small>
          </div>
          <time>{relative(e.received_at)}</time>
        </li>
      ))}
    </ol>
  );
}
function packageMarkdown(p: ScriptPackage) {
  return (
    `# ${p.campaign_name} — ${p.week}\n\n${p.overview}\n\n## Audience research\n${p.research}\n\n` +
    p.scripts
      .map(
        (s) =>
          `## Day ${s.day} — ${s.title}\n\n### Hook\n${s.selected_hook}\n\n${s.body_sections.map((b) => `${b.voiceover}\n\nVisual: ${b.visual_direction}`).join("\n\n")}\n\nCTA: ${s.cta}\n\nEditor notes: ${s.editor_notes}`,
      )
      .join("\n\n---\n\n") +
    `\n\n## Review notes\n${p.review_notes}`
  );
}

function mergeRecords<T extends { id?: string; event_id?: string }>(
  primary: T[],
  secondary: T[],
): T[] {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((row) => {
    const key = row.id ?? row.event_id!;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
