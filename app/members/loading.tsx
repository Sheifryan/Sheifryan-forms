import { TableSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <TableSkeleton rows={5} cols={5} />;
}