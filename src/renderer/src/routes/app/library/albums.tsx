import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardAction,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "lucide-react";

export const Route = createFileRoute("/app/library/albums")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col h-full overflow-y-auto mb-20 px-6">
      <div>
        {/* Header */}
        <p>Albums</p>
        <p>count {37}</p>
      </div>
      <div>{/* Filters */}</div>
      <div className="flex flex-wrap gap-x-8 w-full gap-y-12 pb-4">
        {/* Content */}
        {[0, 1, 2, 3, 4, 5, 7, 8, 9, 10].map((_) => (
          <div className="flex flex-col gap-2 max-w-fit">
            <img
              src="https://avatar.vercel.sh/shadcn1"
              alt="Event cover"
              className="relative z-20 aspect-video rounded-lg size-36 object-cover brightness-60 grayscale dark:brightness-40"
            />
            <p className="hover:underline font-semibold text-sm">
              Album artist
            </p>
            <p>Album title</p>
          </div>
        ))}
      </div>
    </div>
  );
}
