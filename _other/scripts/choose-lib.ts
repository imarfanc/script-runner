export type TaskName = "dev" | "start" | "check" | "git:history";
export type TaskGroup = "run" | "check" | "repo";

export interface Task {
  name: TaskName;
  group: TaskGroup;
  description: string;
}

export type PickerRow =
  | { kind: "spacer" }
  | { kind: "heading"; group: TaskGroup }
  | { kind: "task"; task: Task; taskIndex: number };

export type MouseAction =
  | { kind: "click"; column: number; row: number }
  | { kind: "scroll"; delta: -1 | 1 };

export const TASKS: Task[] = [
  { name: "dev", group: "run", description: "Run the app with file watching" },
  { name: "start", group: "run", description: "Run the app once" },
  { name: "check", group: "check", description: "Format-check, lint, type-check, and test" },
  {
    name: "git:history",
    group: "repo",
    description: "Write Markdown files from Git history",
  },
];

export function pickerRows(tasks: Task[] = TASKS): PickerRow[] {
  const rows: PickerRow[] = [];
  let previous: TaskGroup | undefined;
  tasks.forEach((task, taskIndex) => {
    if (task.group !== previous) {
      if (previous !== undefined) rows.push({ kind: "spacer" });
      rows.push({ kind: "heading", group: task.group });
      previous = task.group;
    }
    rows.push({ kind: "task", task, taskIndex });
  });
  return rows;
}

export function taskIndexAtScreenRow(
  rows: PickerRow[],
  screenRow: number,
  firstRow = 3,
): number | null {
  const row = rows[screenRow - firstRow];
  return row?.kind === "task" ? row.taskIndex : null;
}

/** Parse xterm's SGR mouse format, enabled with terminal mode 1006. */
export function parseMouse(input: string): MouseAction | null {
  const pattern = new RegExp(`${String.fromCharCode(27)}\\[<(\\d+);(\\d+);(\\d+)([Mm])`);
  const match = input.match(pattern);
  if (!match || match[4] !== "M") return null;
  const button = Number(match[1]);
  if (button === 0) {
    return { kind: "click", column: Number(match[2]), row: Number(match[3]) };
  }
  if (button === 64) return { kind: "scroll", delta: -1 };
  if (button === 65) return { kind: "scroll", delta: 1 };
  return null;
}

export function moveSelection(current: number, delta: number, count = TASKS.length): number {
  return Math.max(0, Math.min(count - 1, current + delta));
}
