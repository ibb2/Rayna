import { Spinner } from "@/components/ui/spinner";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import BlankImage from "@/assets/512px-Black_colour.jpg";
import React from "react";

export const Route = createFileRoute("/app/library/albums")({
  component: RouteComponent,
});

function RouteComponent() {
  const fetchAlbums = async ({ pageParam }) => {
    const res = await fetch(
      `http://127.0.0.1:34567/music/albums/all?cursor=${pageParam || ""}&page_size=20`,
    );
    return res.json();
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ["allAlbums"],
    queryFn: fetchAlbums,
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  return status === "pending" ? (
    <p>Loading...</p>
  ) : status === "error" ? (
    <p>Error: {error.message}</p>
  ) : (
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
      {data.pages.map((group, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-wrap gap-x-8 w-full gap-y-8 pb-4">
            {group.items.map((album) => (
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
        </React.Fragment>
      ))}
      <div>
        <button
          onClick={() => fetchNextPage()}
          disabled={!hasNextPage || isFetching}
        >
          {isFetchingNextPage
            ? "Loading more..."
            : hasNextPage
              ? "Load More"
              : "Nothing more to load"}
        </button>
      </div>
      <div>{isFetching && !isFetchingNextPage ? "Fetching..." : null}</div>
    </div>
  );
}
