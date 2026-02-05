import Libraries from "@/components/settings/libraries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { PlexServer } from "@/types";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Music, Check } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

export function SettingsPage() {
  const router = useRouter();
  // const [volume, setVolume] = useState([70])
  const [crossfade, setCrossfade] = useState([0]);
  const [selectedLibraries, setSelectedLibraries] = useState<any[] | null>(
    null,
  );
  const [selectedServer, setSelectedServer] = useState<PlexServer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLibrary, setEditingLibrary] = useState(false);

  const selectLibrary = (key: string) => {
    if (selectedLibraries?.includes(key)) {
      const selectedItemRemoved = selectedLibraries.filter((s) => {
        return s !== key;
      });
      setSelectedLibraries([...selectedItemRemoved]);

      return;
    }

    setSelectedLibraries([...selectedLibraries!!, key]);
  };

  const toggleEditing = () => {
    setEditingLibrary(!editingLibrary);
  };

  const save = async () => {
    if (selectedLibraries && selectedLibraries.length > 0) {
      await window.api.auth.selectLibraries(selectedLibraries);

      const accessToken = await window.api.auth.getUserAccessToken();
      console.log("serverUrl:", selectedServer?.connections);

      const response = await fetch(`http://127.0.0.1:34567/init`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverUrl: selectedServer?.connections[0].uri,
          libraries: selectedLibraries,
        }),
      });
      await response.json();

      setEditingLibrary(false);
    }
  };

  useEffect(() => {
    const fetchSelectedServer = async () => {
      try {
        const server = await window.api.auth.getUserSelectedServer();
        setSelectedServer(server);
      } catch (error) {
        console.error("Failed to fetch selected server:", error);
      }
    };
    const fetchSelectedLibraries = async () => {
      try {
        const libs = await window.api.auth.getUserSelectedLibraries();
        setSelectedLibraries(libs);
      } catch (error) {
        console.error("Failed to fetch selected libraries:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSelectedServer();
    fetchSelectedLibraries();
  }, []);

  const handleChangeLibraries = () => {
    router.navigate({ to: "/setup" });
  };

  return (
    <div className="flex flex-col overflow-y-auto gap-2 p-6 mb-20">
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl mb-2">Settings</h1>
            <p>Manage your preferences</p>
          </div>

          {/* Account Section */}
          {/* <section className="space-y-4">
            <h2 className=" text-xl">Account</h2>
            <div className=" rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="">Username</div>
                  <div className=" text-sm">music_lover_2024</div>
                </div>
                <Button variant="outline" className="bg-transparent">
                  Edit Profile
                </Button>
              </div>
              <Separator className="" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="">Plex Server</div>
                  <div className=" text-sm">
                    Connected to: home-server.local
                  </div>
                </div>
                <Button variant="outline" className="bg-transparent">
                  Change Server
                </Button>
              </div>
            </div>
          </section> */}

          {/* Playback Section */}
          {/* <section className="space-y-4">
            <h2 className=" text-xl">Playback</h2>
            <div className=" rounded-lg p-6">
              <p className=" text-sm">Playback settings coming soon</p>
            </div>
          </section> */}

          {/* Display Section */}
          {/* <section className="space-y-4">
            <h2 className=" text-xl">Display</h2>
            <div className=" rounded-lg p-6">
              <p className=" text-sm">Display settings coming soon</p>
            </div>
          </section> */}

          {/* Library Section */}
          <section className="space-y-4">
            <h2 className=" text-xl">Library</h2>
            <div className="border-2 border-zinc-100 rounded-lg p-6 space-y-6">
              <div>
                <Label className=" mb-2 block">Selected Libraries</Label>
                {loading ? (
                  <div className=" text-sm">Loading libraries...</div>
                ) : selectedLibraries && selectedLibraries.length > 0 ? (
                  <>
                    {!editingLibrary ? (
                      <div className="space-y-2 mb-4">
                        {selectedLibraries.map((library) => (
                          <Item
                            variant={
                              selectedLibraries.some(
                                (l) => l.uuid === library.uuid,
                              )
                                ? "muted"
                                : "outline"
                            }
                            size="sm"
                            asChild
                            onClick={() => selectLibrary(library.uuid)}
                          >
                            <div className="w-full h-full">
                              <ItemMedia>
                                <Music className="size-5" />
                              </ItemMedia>
                              <ItemContent>
                                <ItemTitle className="justify-self-start">
                                  {library.title}
                                </ItemTitle>
                              </ItemContent>
                              <ItemActions>
                                {selectedLibraries.some(
                                  (l) => l.uuid === library.uuid,
                                ) && <Check className="size-4" />}
                              </ItemActions>
                            </div>
                          </Item>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <Libraries
                          cancel={toggleEditing}
                          save={save}
                          server={selectedLibraries}
                          selectedLibraries={selectedLibraries}
                          selectLibrary={selectLibrary}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm mb-4">No libraries selected</div>
                )}
                {!editingLibrary && (
                  <Button
                    onClick={() => {
                      setEditingLibrary(true);
                    }}
                  >
                    Edit Libraries
                  </Button>
                )}
              </div>

              {/* Framework for future library features */}
              {/* <Separator className="bg-zinc-700" />

              <div className="text-zinc-500 text-sm space-y-2">
                <p className="">Additional library features coming soon:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Auto-organize Files</li>
                  <li>Download Metadata</li>
                  <li>Library Scan</li>
                </ul>
              </div> */}
            </div>
          </section>

          {/* <Separator className="" /> */}

          {/* Storage Section */}
          {/* <section className="space-y-4">
            <h2 className=" text-xl">Storage</h2>
            <div className=" rounded-lg p-6">
              <p className=" text-sm">Storage management coming soon</p>
            </div>
          </section>

          <div className="pb-8"></div> */}
        </div>
      </div>
    </div>
  );
}
