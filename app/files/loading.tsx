import { TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <TableSkeleton rows={6} cols={5} />;
}