"use client";

import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@safe-her/ui/components/card";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center gap-10 p-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">SafeHer</h1>
        <p className="text-sm text-muted-foreground">
          Report incidents and explore risk zones in your area.
        </p>
      </div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <Link href="/reports" className="group">
          <Card className="h-full transition-colors group-hover:bg-muted/50">
            <CardHeader>
              <CardTitle>Report Incident</CardTitle>
              <CardDescription>Report a safety concern and pin it on the map.</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-xs font-medium text-primary">Get started &rarr;</span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/heatmap" className="group">
          <Card className="h-full transition-colors group-hover:bg-muted/50">
            <CardHeader>
              <CardTitle>View Heatmap</CardTitle>
              <CardDescription>Explore risk zones in your neighborhood.</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-xs font-medium text-primary">Get started &rarr;</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </main>
  );
}
