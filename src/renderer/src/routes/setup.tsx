import SelectServer from '@/components/setup/server'
import { Carousel, CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/setup')({
  component: RouteComponent,
})

function RouteComponent() {

  const [progression, setProgression] = useState(0)
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)
  const [count, setCount] = useState(0)

  const progressForwards = () => {
    setProgression(progression + 1)
    api?.scrollNext()
  }

  const progressBackwards = () => {
    if (progression > 0) { 
      setProgression(progression - 1)
      api?.scrollPrev()
    }
  }

  return (
  <div className='flex items-center justify-center w-full h-screen'>
    <Carousel className="w-full max-w-[12rem] sm:max-w-xs" setApi={setApi}>
      <CarouselContent className='w-full'>
        <CarouselItem>    
            <SelectServer progress={progressForwards} />
        </CarouselItem>
        <CarouselItem>...</CarouselItem>
        <CarouselItem>...</CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
    </div>
  )
}
