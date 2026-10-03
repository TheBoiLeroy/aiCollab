import Link from "next/link";
import { redirect } from "next/navigation";
import { joinWorkspace } from "@/app/actions";
import { SubmitButton } from "@/components/forms";
import { requireUser } from "@/lib/supabase/server";

type Preview = { workspace_id: string; name: string; member_count: number; already_member: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JoinPage({ params, searchParams }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data } = UUID.test(token)
    ? await supabase.rpc("invite_link_preview", { p_token: token }).maybeSingle<Preview>()
    : { data: null };
  if (data?.already_member) redirect(`/w/${data.workspace_id}`);

  const full = !!data && data.member_count >= 5;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-12">
      {data ? (
        <div className="card flex flex-col gap-4">
          <div>
            <p className="text-sm text-muted">You&apos;ve been invited to</p>
            <h1 className="text-2xl font-semibold">{data.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {data.member_count} of 5 members · joining as {user.email}
            </p>
          </div>
          {full || error === "full" ? (
            <p className="text-sm text-red-600">This workspace is full (5 members).</p>
          ) : (
            <form action={joinWorkspace.bind(null, token)}>
              <SubmitButton className="btn-primary w-full" pendingText="Joining…">
                Join workspace
              </SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <div className="card">
          <h1 className="text-lg font-semibold">This invite link doesn&apos;t work</h1>
          <p className="mt-1 text-sm text-muted">It may have been reset. Ask whoever sent it for a new one.</p>
        </div>
      )}
      <Link href="/workspaces" className="text-sm text-muted hover:underline">
        ← Your workspaces
      </Link>
    </main>
  );
}
