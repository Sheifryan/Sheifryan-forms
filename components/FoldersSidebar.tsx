"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, FolderOpen, FolderPlus, LayoutGrid, Pencil, Plus, X } from "lucide-react";
import { useToast } from "@/components/Toast";

interface FolderRow {
  id: string;
  name: string;
}

interface Props {
  folders: FolderRow[];
  /** "all" | "none" | folder id — drives the highlighted row. */
  activeFolderId: string;
  /** Per-view form counts; the dashboard passes these (other pages omit them). */
  counts?: { all: number; none: number; [folderId: string]: number };
}

// Folders live in the app sidebar. Selecting a folder navigates to
// /forms?folder=<id> so the active state survives refresh + back.
export function FoldersSidebar({ folders, activeFolderId, counts }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<FolderRow[]>(folders);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const toast = useToast();

  // Re-sync after the server re-fetches folders (create/rename/delete).
  useEffect(() => setItems(folders), [folders]);

  function select(folderId: string) {
    if (folderId === "all") router.push("/forms");
    else if (folderId === "none") router.push("/forms?folder=none");
    else router.push(`/forms?folder=${encodeURIComponent(folderId)}`);
  }

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) toast.success("Folder created", { description: name });
    else toast.error("Couldn't create the folder");
    setNewName("");
    setNewOpen(false);
    router.refresh();
  }

  // Creates a form inside a specific folder and jumps straight into the builder.
  async function createFormInFolder(folderId: string) {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled form", folderId }),
    });
    const data = await res.json();
    if (data.id) {
      const folderName = items.find((i) => i.id === folderId)?.name ?? "folder";
      toast.success("Form created", { description: `Added to “${folderName}”.` });
      router.push(`/builder/${data.id}`);
    } else {
      toast.error("Couldn't create the form");
    }
  }

  async function renameFolder(id: string, name: string) {
    const res = await fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) toast.info("Folder renamed");
    else toast.error("Couldn't rename the folder");
    router.refresh();
  }

  async function deleteFolder(id: string) {
    const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (res.ok) toast.warning("Folder deleted");
    else toast.error("Couldn't delete the folder");
    if (activeFolderId === id) router.push("/forms");
    else router.refresh();
  }

  // HTML5 DnD: the dashboard's form cards write their id into dataTransfer
  // on dragstart; because the grid and this sidebar are sibling subtrees we
  // can't rely on shared React state, so the drop reads the payload instead.
  async function handleDrop(folderId: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const formId = e.dataTransfer.getData("application/x-form");
    if (!formId) return;
    const res = await fetch(`/api/forms/${formId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId === "all" || folderId === "none" ? null : folderId }),
    });
    if (res.ok) {
      const folderName =
        folderId === "all" || folderId === "none"
          ? "Uncategorized"
          : items.find((i) => i.id === folderId)?.name ?? "folder";
      toast.success("Form moved", { description: folderName });
    } else {
      toast.error("Couldn't move the form");
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Folders</h3>
        <button
          onClick={() => setNewOpen((v) => !v)}
          className="rounded p-1 text-muted transition hover:bg-paper hover:text-ink"
        >
          <FolderPlus size={14} />
        </button>
      </div>

      {newOpen && (
        <form onSubmit={createFolder} className="mb-2 flex gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Folder name"
            className="w-full rounded-md border border-line bg-white px-2 py-1.5 font-body text-xs outline-none focus:border-signal"
          />
        </form>
      )}

      <div className="space-y-1">
        <FolderRow
          label="All forms"
          count={counts?.all}
          icon={LayoutGrid}
          active={activeFolderId === "all"}
          onClick={() => select("all")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("all");
          }}
          onDrop={(e) => handleDrop("all", e)}
          isDropTarget={dragOver === "all"}
        />
        <FolderRow
          label="Uncategorized"
          count={counts?.none}
          icon={Folder}
          active={activeFolderId === "none"}
          onClick={() => select("none")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("none");
          }}
          onDrop={(e) => handleDrop("none", e)}
          isDropTarget={dragOver === "none"}
        />
        {items.map((folder) => (
          <FolderRow
            key={folder.id}
            label={folder.name}
            count={counts?.[folder.id]}
            icon={FolderOpen}
            active={activeFolderId === folder.id}
            onClick={() => select(folder.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(folder.id);
            }}
            onDrop={(e) => handleDrop(folder.id, e)}
            isDropTarget={dragOver === folder.id}
            onRename={(name) => renameFolder(folder.id, name)}
            onDelete={() => deleteFolder(folder.id)}
            onNewForm={() => createFormInFolder(folder.id)}
          />
        ))}
      </div>
      <p className="mt-3 px-1 font-body text-[10.5px] leading-snug text-muted">
        Drag a form card onto a folder to move it. Hover a folder and hit “+” to start a new form inside it.
      </p>
    </div>
  );
}
function FolderRow({
  label,
  count,
  icon: Icon,
  active,
  onClick,
  onDragOver,
  onDrop,
  isDropTarget,
  onRename,
  onDelete,
  onNewForm,
}: {
  label: string;
  count?: number;
  icon: typeof Folder;
  active: boolean;
  onClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDropTarget: boolean;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onNewForm?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onRename?.(value.trim());
          setEditing(false);
        }}
        className="px-1"
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
          className="w-full rounded-md border border-signal bg-white px-2 py-1.5 font-body text-xs outline-none"
        />
      </form>
    );
  }

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left font-body text-xs transition ${
        active
          ? "bg-signalSoft font-semibold text-signal"
          : isDropTarget
            ? "bg-signalSoft/60 text-signal"
            : "text-stone-600 hover:bg-paper"
      }`}
    >
      <Icon size={13} className={active ? "text-signal" : "text-muted"} />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-[10.5px] text-muted">{count}</span>}
      {onNewForm && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNewForm();
          }}
          title={`Create form in ${label}`}
          className="hidden rounded p-0.5 text-muted hover:bg-stone-200 group-hover:block"
        >
          <Plus size={11} />
        </button>
      )}
      {onRename && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="hidden rounded p-0.5 text-muted hover:bg-stone-200 group-hover:block"
        >
          <Pencil size={11} />
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="hidden rounded p-0.5 text-muted hover:bg-rose-100 hover:text-warn group-hover:block"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}