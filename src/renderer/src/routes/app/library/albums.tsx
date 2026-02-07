import { Spinner } from "@/components/ui/spinner";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import BlankImage from "@/assets/512px-Black_colour.jpg";
import React, { useEffect, useRef } from "react";

export const Route = createFileRoute("/app/library/albums")({
  component: RouteComponent,
});

function RouteComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

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
    // fetchPreviousPage,
    hasNextPage,
    // hasPreviousPage,
    isFetching,
    isFetchingNextPage,
    // isFetchingPreviousPage,
    status,
  } = useInfiniteQuery({
    queryKey: ["allAlbums"],
    queryFn: fetchAlbums,
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // getPreviousPageParam: (firstPage) => firstPage.prevCursor,
  });

  const observerRef = useRef<HTMLDivElement>(null);
  // const previousObserverRef = useRef(0);

  // Check if content fills the viewport and fetch more if needed
  useEffect(() => {
    if (!containerRef.current || !hasNextPage || isFetching) return;

    const container = containerRef.current;
    const hasScroll = container.scrollHeight > container.clientHeight;

    if (!hasScroll) {
      console.log("Content doesn't fill viewport, fetching more...");
      fetchNextPage();
    }
  }, [data, hasNextPage, isFetching, fetchNextPage]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      console.log("intersection", entries[0].isIntersecting);
      console.log("next page", hasNextPage);
      if (entries[0].isIntersecting && hasNextPage && !isFetching) {
        console.log("fetching next page");
        fetchNextPage();
      }
    });

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }
    // const previousObserver = new IntersectionObserver((entries) => {
    //   if (entries[0].isIntersecting && hasNextPage) {
    //     fetchPreviousPage();
    //   }
    // });
    // if (previousObserverRef.current) {
    //   previousObserver.observe(previousObserverRef.current);
    // }
    return () => {
      if (observerRef.current) observer.unobserve(observerRef.current);
      // if (previousObserverRef.current) previousObserver.disconnect();
    };
  }, [hasNextPage, isFetching, fetchNextPage]);

  return status === "pending" ? (
    <p>Loading...</p>
  ) : status === "error" ? (
    <p>Error: {error.message}</p>
  ) : (
    <div
      ref={containerRef}
      className="flex flex-col gap-4 h-full overflow-y-scroll mb-20 px-6 "
    >
      <div className="absolute z-50 bg-background w-full pb-2">
        {/* Header */}
        <p className="text-2xl font-semibold">Albums</p>
        {/* <p>count {37}</p> */}
      </div>
      <div>
        {/* Filters */}
        {/* <p></p> */}
      </div>
      {/* <div ref={previousObserverRef} className="flex items-center">
        {isFetching && !isFetchingNextPage ? (
          <Spinner className="size-4" />
        ) : null}
      </div> */}
      <div className="flex flex-wrap gap-8 w-full pb-4 pt-8">
        {data.pages.map((group, i) => (
          <React.Fragment key={i}>
            {group.items.map((album) => (
              <div className="flex flex-col gap-4 max-w-sm">
                <img
                  src={album.thumb ?? BlankImage}
                  alt={album.title}
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
                    <p className="hover:underline font-semibold text-xs text-muted-foreground">
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
