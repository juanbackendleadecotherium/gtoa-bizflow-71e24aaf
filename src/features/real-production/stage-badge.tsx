import { stageMeta } from "./meta";

export function StageBadge({ stage }: { stage: string }) {
  const m = stageMeta(stage);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${m.color}`}>
      {m.label}
    </span>
  );
}
