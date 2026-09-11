import { redirect } from "next/navigation";

// The Responses section replaced the older Submissions area. Keep the URL
// working so bookmarks and the analytics links keep pointing somewhere real.
export default function SubmissionsPage({ searchParams }: { searchParams: { form?: string } }) {
  const params = new URLSearchParams();
  if (searchParams.form) params.set("form", searchParams.form);
  const query = params.toString();
  redirect(`/responses${query ? `?${query}` : ""}`);
}
