import Libraries from "@/components/setup/libraries";
import SelectServer from "@/components/setup/server";
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/setup")({
  component: RouteComponent,
});

function RouteComponent() {
  const [progression, setProgression] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  const progressForwards = () => {
    setProgression(progression + 1);
    api?.scrollNext();
  };

  const progressBackwards = () => {
    if (progression > 0) {
      setProgression(progression - 1);
      api?.scrollPrev();
    }
  };

  useEffect(() => {
    if (!api) {
      return;
    }
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-screen">
      <Carousel className="w-full max-w-[12rem] sm:max-w-xs" setApi={setApi}>
        <CarouselContent className="w-full">
          <CarouselItem>
            <SelectServer progress={progressForwards} />
          </CarouselItem>
          <CarouselItem>
            <Libraries progress={progressBackwards} />
          </CarouselItem>
          <CarouselItem>...</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <div className="flex flex-row gap-1 text-muted-foreground py-2 text-center text-sm">
        {[1, 2, 3].map((item: number, index) => (
          <div
            className={cn(
              "h-2 w-8 rounded-2xl",
              item === current ? "bg-gray-300" : "bg-gray-100/20",
            )}
            key={index}
          ></div>
        ))}
      </div>
    </div>
  );
}
