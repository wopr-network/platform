import { HomeIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { brandName } from "@/lib/brand-config";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <SearchXIcon aria-hidden="true" className="size-6 text-muted-foreground" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {brandName()}
              </p>
              <CardTitle className="text-xl">404</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This page doesn&apos;t exist. It may have been moved or the URL might be incorrect.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/">
              <HomeIcon aria-hidden="true" />
              Dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
