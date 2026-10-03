import { LoginForms } from "./login-forms";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Intermediary</h1>
        <p className="mt-1 text-sm text-muted">
          Work privately with your own AI. Share the artifact, not the chat. Change it together through team review.
        </p>
      </div>
      {error === "confirm" && (
        <p className="text-sm text-red-600">That confirmation link didn&apos;t work. Try signing in, or sign up again.</p>
      )}
      <LoginForms next={typeof next === "string" ? next : ""} />
    </main>
  );
}
