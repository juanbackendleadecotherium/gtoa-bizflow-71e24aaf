import { Badge } from "@/components/ui/badge";

export function StatusBadge({ name, color }: { name: string; color: string }) {
  return (
    <Badge
      variant="outline"
      style={{ borderColor: color, color }}
      className="font-medium"
    >
      <span className="h-1.5 w-1.5 rounded-full mr-1.5" style={{ background: color }} />
      {name}
    </Badge>
  );
}
