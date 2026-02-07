import { Spinner } from "@/components/ui/spinner";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import BlankImage from "@/assets/512px-Black_colour.jpg";
import React, { useEffect, useRef } from "react";

export const Route = createFileRoute("/app/library/albums")({
  component: RouteComponent,
});

function RouteComponent() {
  const fetchAlbums = async ({ pageParam }) => {
    const res = await fetch(
      `http://127.0.0.1:34567/music/albums/all?cursor=${pageParam || ""}&page_size=10`,
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

  const observerRef = useRef(0);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });
    if (observerRef.current) {
      observer.observe(observerRef.current);
    }
    return () => {
      if (observerRef.current) observer.unobserve(observerRef.current);
    };
  }, [hasNextPage]);

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
      <div className="flex flex-wrap gap-x-8 w-full gap-y-8 pb-4">
        {data.pages.map((group, i) => (
          <React.Fragment key={i}>
            {group.items.map((album) => (
              <div className="gap-2 max-w-sm">
                <img
                  src={album.thumb ?? BlankImage}
                  alt="Event cover"
                  className="relative z-20 aspect-video rounded-lg size-36 object-cover"
                />
                <div className="w-36">
                  <Link
                    to={`/app/album/$ratingKey`}
                    params={{ ratingKey: album.ratingKey }}
                  >
                    <p className="truncate hover:underline max-w-sm text-sm">
                      {album.title}
                    </p>
                  </Link>
                  <Link
                    to={`/app/artist/$ratingKey`}
                    params={{ ratingKey: album.parentRatingKey }}
                  >
                    <p className="hover:underline font-semibold text-xs">
                      {album.artist}
                    </p>
                  </Link>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      {/* <div>
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
      </div> */}
      <div ref={observerRef} className="flex items-center">
        {isFetching && !isFetchingNextPage ? (
          <Spinner className="size-4" />
        ) : null}
      </div>
    </div>
  );
}
