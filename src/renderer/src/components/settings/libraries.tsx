import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { BadgeCheckIcon, Check, ChevronRightIcon, Music } from "lucide-react";
import { useState } from "react";

export default function Libraries({
  cancel,
  save,
  server,
  selectedLibraries,
  selectLibrary,
}) {
  const router = useRouter();
  const [loading, isLoading] = useState(false);

  const { isPending, error, data } = useQuery({
    queryKey: ["libraries"],
    queryFn: async () => {
      const res = await fetch("http://127.0.0.1:34567/library/sections/all");
      if (!res.ok) throw new Error("Failed to fetch libraries");
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    retry: true,
  });

  if (isPending)
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Spinner className="size-8" />
      </div>
    );

  if (error) return "An error has occurred: " + error?.message;

  return (
    <div className="flex flex-1 flex-col gap-12 overflow-y-auto h-full">
      <div className="flex flex-col gap-2">
        {data.map((library) => (
          <div key={library.uuid}>
            {library.type === "artist" ? (
              <Item
                onClick={() => selectLibrary(library)}
                variant={
                  selectedLibraries.some((l) => {
                    return l.uuid === library.uuid;
                  })
                    ? "muted"
                    : "outline"
                }
                size="sm"
                asChild
              >
                <div className="w-full h-full">
                  <ItemMedia>
                    <Music className="size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="justify-self-start">
                      {library.title}
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    {selectedLibraries.some((l) => {
                      return l.uuid === library.uuid;
                    }) && <Check className="size-4" />}
                  </ItemActions>
                </div>
              </Item>
            ) : (
              <div></div>
            )}
          </div>
        ))}
      </div>
      <div className="flex w-full gap-2 justify-end">
        <Button onClick={cancel} variant={"secondary"}>
          Cancel
        </Button>
        <Button onClick={save}>Save</Button>
      </div>
    </div>
  );
}
