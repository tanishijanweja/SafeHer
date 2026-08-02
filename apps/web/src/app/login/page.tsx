"use client";

import { HeartHandshake, HeartPulse } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@safe-her/ui/components/button";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { setDemoSession } from "@/lib/auth";

export default function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const router = useRouter();

  const enterDemo = () => {
    setDemoSession();
    toast.success("Signed in as demo user (test-user-001)");
    router.push("/dashboard");
  };

  return (
    <div className="safeher-glow flex min-h-full items-start justify-center overflow-y-auto px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/20">
            <HeartHandshake className="size-6" />
          </span>
          <h1 className="text-2xl font-bold text-foreground">
            Safe<span className="text-gradient-pink">Her</span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {showSignIn ? "Welcome back — your safety network is ready." : "Create your account to join the community."}
          </p>
        </div>

        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}

        <div className="mx-auto mt-5 flex w-full max-w-md items-center gap-3 px-6">
          <div className="h-px flex-1 bg-pink-400/15" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/40">or</span>
          <div className="h-px flex-1 bg-pink-400/15" />
        </div>

        <div className="mx-auto mt-5 w-full max-w-md px-6">
          <Button
            onClick={enterDemo}
            variant="outline"
            className="w-full rounded-full border-pink-400/30 bg-pink-500/10 py-5 text-sm font-medium text-foreground hover:bg-pink-500/20"
          >
            <HeartPulse className="size-4 text-primary" />
            Explore with demo account
          </Button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground/40">
            No signup needed — uses the shared dummy user test-user-001
          </p>
        </div>
      </div>
    </div>
  );
}
