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
import { Check, Music } from "lucide-react";

export default function Libraries({
  complete,
  selectedLibraries,
  selectLibrary,
}) {
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
    <div className="flex flex-1 flex-col gap-12 overflow-y-auto p-4 h-full">
      <h1 className="scroll-m-20 text-center text-4xl font-bold tracking-tight text-balance">
        Libraries
      </h1>
      <div className="flex flex-col gap-2">
        {data.map((library) => (
          <div key={library.uuid}>
            {library.type === "artist" ? (
              <Item
                variant={
                  selectedLibraries.some((l) => l.uuid === library.uuid)
                    ? "muted"
                    : "outline"
                }
                size="sm"
                asChild
                onClick={() => selectLibrary(library)}
              >
                <div className="w-full h-full">
                  <ItemMedia>
                    <Music className="size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{library.title}</ItemTitle>
                    <ItemDescription>{library.type}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {selectedLibraries.some((l) => l.uuid === library.uuid) && (
                      <Check className="size-4" />
                    )}
                  </ItemActions>
                </div>
              </Item>
            ) : (
              <div></div>
            )}
          </div>
        ))}
      </div>
      <Button onClick={complete}>Complete</Button>
    </div>
  );
}
