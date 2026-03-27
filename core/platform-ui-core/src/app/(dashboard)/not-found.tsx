import { ArrowLeftIcon, HomeIcon, TerminalIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function DashboardNotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-lg border-terminal/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <TerminalIcon className="size-5 text-terminal" />
            <span className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              system error
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="font-mono text-6xl font-bold text-terminal">404</p>
          <p className="text-lg text-foreground">
            Route not found
            <span className="animate-ellipsis" />
          </p>
          <p className="text-sm text-muted-foreground">
            The requested page does not exist or has been moved. Check the URL or navigate back to
            the dashboard.
          </p>
        </CardContent>
        <CardFooter className="gap-3">
          <Button variant="terminal" asChild>
            <Link href="/dashboard">
              <HomeIcon />
              Dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <ArrowLeftIcon />
              Go Back
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
