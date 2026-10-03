"use client";

import { useState } from "react";
import { signIn, signUp } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";

export function LoginForms({ next }: { next: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  return (
    <div className="card">
      <div className="mb-4 flex gap-2">
        <button className={mode === "in" ? "btn-primary" : "btn"} onClick={() => setMode("in")}>
          Sign in
        </button>
        <button className={mode === "up" ? "btn-primary" : "btn"} onClick={() => setMode("up")}>
          Create account
        </button>
      </div>
      <ActionForm key={mode} action={mode === "in" ? signIn : signUp} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        {mode === "up" && (
          <div>
            <label className="label" htmlFor="display_name">Your name</label>
            <input id="display_name" name="display_name" className="input" autoComplete="name" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="input"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />
        </div>
        <SubmitButton>{mode === "in" ? "Sign in" : "Create account"}</SubmitButton>
      </ActionForm>
    </div>
  );
}
