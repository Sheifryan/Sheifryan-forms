import { TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <TableSkeleton rows={8} cols={6} />;
}