import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useQuery } from "@tanstack/react-query"


export default function Libraries({progress}) {

  const testApi = () => {
     fetch('http://127.0.0.1:34567/library/sections/all')
  }

  // const queryMusicLibraries = useQuery({
  //   queryKey: ['libraries'],
  //   queryFn: async () => {

  //     // const accessToken = await window.api.auth.getUserAccessToken()

  //     fetch('http://127.0.0.1:34567/library/sections/all').then((res) => {
  //       if (!res.ok) throw new Error('Network response was not ok')
  //       return res.json()
  //     })},
  //   staleTime: 30 * 60 * 1000,
  //   retry: true
  // })

  // if (
  //   queryMusicLibraries.isLoading
  // )
  //   return (
  //     <div className="flex items-center justify-center w-full h-full">
  //       <Spinner className="size-8" />
  //     </div>
  //   )
  // if (
  //   queryMusicLibraries.isError 
  // )
  //   return (
  //     'An error has occurred: ' + queryMusicLibraries.error?.message 
  //   )


  return <div>Select your libraries <Button onClick={() => testApi()} /></div>
}
