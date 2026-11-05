const LABEL: Record<string, string> = { DRAFT: "Draft", APPROVED: "Approved", ARCHIVED: "Archived" };

export function StatusTag({ status }: { status: string }) {
  return <span className={`st-tag st-tag--${status.toLowerCase()}`}>{LABEL[status] ?? status}</span>;
}
