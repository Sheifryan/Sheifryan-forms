import { TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <TableSkeleton rows={4} cols={4} />;
}