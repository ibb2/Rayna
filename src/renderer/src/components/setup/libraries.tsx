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
import { BadgeCheckIcon, Check, ChevronRightIcon, Music } from "lucide-react";

export default function Libraries({ progress }) {
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
    <div>
      <p>Select your libraries</p>
      <div>
        {data.map((library) => (
          <>
            <div
              className="flex w-full max-w-md flex-col gap-6"
              key={library.uuid}
            >
              <Item variant="outline" size="sm" asChild>
                <a href="#">
                  <ItemMedia>
                    <Music className="size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{library.title}</ItemTitle>
                    <ItemDescription>{library.type}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Check className="size-4" />
                  </ItemActions>
                </a>
              </Item>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}
