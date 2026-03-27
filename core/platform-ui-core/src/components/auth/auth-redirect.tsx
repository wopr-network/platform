"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { getBrandConfig } from "@/lib/brand-config";

export function AuthRedirect() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && session) {
      router.replace(getBrandConfig().homePath);
    }
  }, [isPending, session, router]);

  return null;
}
