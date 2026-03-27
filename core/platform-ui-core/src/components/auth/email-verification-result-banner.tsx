"use client";

import { CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

export function EmailVerificationResultBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = searchParams.get("status");
  const [visible, setVisible] = useState(status === "success" || status === "error");

  useEffect(() => {
    if (status === "success" || status === "error") {
      router.replace(pathname, { scroll: false });
    }
  }, [status, router, pathname]);

  if (!visible) return null;

  if (status === "success") {
    return (
      <Banner variant="terminal" role="status">
        <CheckCircle className="size-4 shrink-0" />
        <span className="flex-1">
          Your account is verified. <span className="font-semibold">$5.00</span> in credits added.
        </span>
        <Button
          asChild
          variant="ghost"
          size="xs"
          className="h-auto px-2 py-1 text-xs font-semibold text-terminal hover:text-terminal/80"
        >
          <Link href="/fleet">Create your first bot &rarr;</Link>
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="h-auto px-2 py-1 text-xs text-muted-foreground"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
        >
          Dismiss
        </Button>
      </Banner>
    );
  }

  return (
    <Banner variant="destructive" role="alert">
      <XCircle className="size-4 shrink-0" />
      <span className="flex-1">
        Email verification failed. Please try again or contact support.
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="h-auto px-2 py-1 text-xs text-muted-foreground"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
      >
        Dismiss
      </Button>
    </Banner>
  );
}
