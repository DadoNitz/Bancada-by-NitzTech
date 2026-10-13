import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark, BrandWordmark } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { auth } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default async function LoginPage() {
  // Quem já tem sessão não deve ver a tela de login.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <ThemeToggle className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4" />
      <div className="bg-card w-full max-w-sm space-y-7 rounded-[28px] border p-6 sm:p-8">
        <div className="space-y-3">
          <div className="mb-6 flex items-center gap-3">
            <BrandMark className="size-12" />
            <BrandWordmark className="text-3xl" />
          </div>
          <h1 className="text-3xl leading-none font-extrabold tracking-[-0.04em]">
            Bom ter você de volta
          </h1>
          <p className="text-muted-foreground text-sm">
            Entre para consultar e movimentar o estoque.
          </p>
        </div>

        <LoginForm />
      </div>
      <p className="text-muted-foreground text-xs">
        um produto <span className="text-foreground font-semibold">NitzTech</span>
      </p>
    </main>
  );
}
