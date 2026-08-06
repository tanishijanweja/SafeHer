"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

function LoginContent() {
  const [showSignIn, setShowSignIn] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session) {
      router.push(redirect as never);
    }
  }, [session, router, redirect]);

  if (isPending || session) {
    return <Loader />;
  }

  return showSignIn ? (
    <SignInForm redirect={redirect} onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm redirect={redirect} onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loader />}>
      <LoginContent />
    </Suspense>
  );
}
