import type { NowPlaying } from "./now-playing";

export const MOCK_TRACKS: NowPlaying[] = [
  {
    id: "khruangbin-friday-morning",
    title: "Friday Morning",
    artist: "Khruangbin",
    album: "Con Todo El Mundo",
    artwork: "/artwork/con-todo-el-mundo.jpg",
    source: "vinyl",
    state: "playing",
    duration: 410,
    position: 142,
    year: "2018",
    catalog: "DEAD OCEANS / DOC153",
    trackNumber: "B5",
  },
  {
    id: "khruangbin-maria-tambien",
    title: "Maria También",
    artist: "Khruangbin",
    album: "Con Todo El Mundo",
    artwork: "/artwork/con-todo-el-mundo.jpg",
    source: "streaming",
    state: "playing",
    duration: 190,
    position: 38,
    year: "2018",
    catalog: "DEAD OCEANS / DOC153",
    trackNumber: "A3",
  },
  {
    id: "pvr-live-vinyl",
    title: "Friday Morning",
    artist: "Khruangbin",
    album: "Con Todo El Mundo",
    artwork: "/artwork/con-todo-el-mundo.jpg",
    source: "vinyl",
    state: "playing",
    year: "2018",
    catalog: "DEAD OCEANS / DOC153",
    trackNumber: "B5",
  },
];

export function mockTrack(index: number, now = Date.now()): NowPlaying {
  return { ...MOCK_TRACKS[index % MOCK_TRACKS.length], positionUpdatedAt: now };
}
