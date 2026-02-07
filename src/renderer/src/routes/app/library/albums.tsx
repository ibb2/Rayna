import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import BlankImage from "@/assets/512px-Black_colour.jpg";

export const Route = createFileRoute("/app/library/albums")({
  component: RouteComponent,
});

function RouteComponent() {
  const albums = useQuery({
    queryKey: ["albums"],
    queryFn: () =>
      fetch("http://127.0.0.1:34567/music/albums/all").then((res) => {
        if (!res.ok) throw new Error("Network response was not ok");
        return res.json();
      }),
  });

  if (albums.isLoading)
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Spinner className="size-8" />
      </div>
    );
  if (albums.isError) return "An error has occurred: " + albums.error?.message;

  return (
    <div className="flex flex-col h-full overflow-y-auto mb-20 px-6">
      <div>
        {/* Header */}
        {/* <p>Albums</p>
        <p>count {37}</p> */}
      </div>
      <div>
        {/* Filters */}
        {/* <p></p> */}
      </div>
      <div className="flex flex-wrap gap-x-8 w-full gap-y-8 pb-4">
        {/* Content */}
        {albums.data.map((album) => (
          <div className="flex flex-col gap-2 max-w-sm">
            <img
              src={album.thumb ?? BlankImage}
              alt="Event cover"
              className="relative z-20 aspect-video rounded-lg size-36 object-cover"
            />
            <div className="w-36">
              <p className="truncate hover:underline max-w-sm text-sm">
                {album.title}
              </p>
              <p className="hover:underline font-semibold text-xs">
                {album.artist}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
