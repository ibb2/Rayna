import { Spinner } from "@/components/ui/spinner"
import { useQuery } from "@tanstack/react-query"


export default function Libraries({progress}) {

  const { isPending, error, data } = useQuery({
    queryKey: ['libraries'],
    queryFn: async () => {
      const res = await fetch('http://127.0.0.1:34567/library/sections/all')
      if (!res.ok) throw new Error('Failed to fetch libraries')
      return res.json()
    },
    staleTime: 30 * 60 * 1000,
    retry: true
  })

  if (
    isPending
  )
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Spinner className="size-8" />
      </div>
    )

  if (error )
    return (
      'An error has occurred: ' + error?.message 
    )


  return (
    <div>
      <p>Select your libraries</p>
      <div>
        {data.map((library) => (
          <div>
            <p>1</p>
            <p>{library.title}</p>
            </div>
        ))}
      </div>
    </div>
  )
}
